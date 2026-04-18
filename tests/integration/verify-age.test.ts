/**
 * Integration tests for POST /api/me/verify-age (V8 §19.4).
 *
 * Validates:
 *  - level enum guard
 *  - "verified" gracefully degrades to "self_declared" when YOTI_API_KEY missing
 *  - "verified" requires yotiSessionId when key IS configured
 *  - persists ageVerified + ageVerifiedAt
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  user: {
    update: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

class MockAuthError extends Error {
  public status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "u_1",
    email: "u@x.com",
    name: "U",
    role: "user",
  })),
  AuthError: MockAuthError,
}));

// V8 §19.4 — the route now consults lib/yoti before flipping verified.
type YotiState = "ONGOING" | "COMPLETED" | "FAILED" | "EXPIRED" | "UNKNOWN";
interface YotiStatus {
  state: YotiState;
  ageVerified: boolean;
  userTrackingId?: string;
}
const isYotiConfiguredMock = vi.fn(() => false);
const getYotiSessionStatusMock = vi.fn(
  async (_id: string): Promise<YotiStatus> => ({
    state: "COMPLETED",
    ageVerified: true,
    userTrackingId: "u_1",
  })
);
vi.mock("@/lib/yoti", () => ({
  isYotiConfigured: isYotiConfiguredMock,
  getYotiSessionStatus: getYotiSessionStatusMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;

const originalYoti = process.env.YOTI_API_KEY;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/me/verify-age/route");
  POST = mod.POST;
});

afterEach(() => {
  if (originalYoti === undefined) {
    delete process.env.YOTI_API_KEY;
  } else {
    process.env.YOTI_API_KEY = originalYoti;
  }
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/me/verify-age", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/me/verify-age — validation", () => {
  it("400 on invalid level enum", async () => {
    const res = await POST(req({ level: "maybe" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/me/verify-age — self_declared", () => {
  it("persists self_declared + ageVerifiedAt", async () => {
    prismaMock.user.update.mockResolvedValueOnce({});
    const res = await POST(req({ level: "self_declared" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.level).toBe("self_declared");
    expect(data.warning).toBeUndefined();

    const call = prismaMock.user.update.mock.calls[0]?.[0] as
      | { data: { ageVerified: string; ageVerifiedAt: Date } }
      | undefined;
    expect(call?.data.ageVerified).toBe("self_declared");
    expect(call?.data.ageVerifiedAt).toBeInstanceOf(Date);
  });
});

describe("POST /api/me/verify-age — verified (Yoti)", () => {
  it("falls back to self_declared with a warning when YOTI_API_KEY is missing", async () => {
    delete process.env.YOTI_API_KEY;
    prismaMock.user.update.mockResolvedValueOnce({});

    const res = await POST(req({ level: "verified" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.level).toBe("self_declared"); // fallback
    expect(data.warning).toContain("YOTI_API_KEY manquant");
  });

  it("requires yotiSessionId when YOTI_API_KEY is set", async () => {
    process.env.YOTI_API_KEY = "fake-key";
    isYotiConfiguredMock.mockReturnValueOnce(true);
    const res = await POST(req({ level: "verified" })); // no yotiSessionId
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("persists verified when key + yotiSessionId both present + Yoti returns COMPLETED", async () => {
    process.env.YOTI_API_KEY = "fake-key";
    isYotiConfiguredMock.mockReturnValueOnce(true);
    getYotiSessionStatusMock.mockResolvedValueOnce({
      state: "COMPLETED",
      ageVerified: true,
      userTrackingId: "u_1",
    });
    prismaMock.user.update.mockResolvedValueOnce({});
    const res = await POST(
      req({ level: "verified", yotiSessionId: "yoti_123" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.level).toBe("verified");
    expect(data.warning).toBeUndefined();

    const call = prismaMock.user.update.mock.calls[0]?.[0] as
      | { data: { ageVerified: string } }
      | undefined;
    expect(call?.data.ageVerified).toBe("verified");
  });

  it("rejects when Yoti returns FAILED", async () => {
    process.env.YOTI_API_KEY = "fake-key";
    isYotiConfiguredMock.mockReturnValueOnce(true);
    getYotiSessionStatusMock.mockResolvedValueOnce({
      state: "FAILED",
      ageVerified: false,
    });
    const res = await POST(
      req({ level: "verified", yotiSessionId: "yoti_123" })
    );
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects when Yoti session belongs to a different user", async () => {
    process.env.YOTI_API_KEY = "fake-key";
    isYotiConfiguredMock.mockReturnValueOnce(true);
    getYotiSessionStatusMock.mockResolvedValueOnce({
      state: "COMPLETED",
      ageVerified: true,
      userTrackingId: "different_user",
    });
    const res = await POST(
      req({ level: "verified", yotiSessionId: "yoti_123" })
    );
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
