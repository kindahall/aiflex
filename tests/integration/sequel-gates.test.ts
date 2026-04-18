/**
 * Integration tests for POST /api/sequel eligibility gates (V7 §4.2).
 *
 * We mock @/lib/prisma, @/lib/auth, @/lib/agent, @/lib/notify so the route
 * runs through its gate logic with no real DB / AI calls. The goal is to
 * verify that each refusal path fires correctly — not to test Prisma itself.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

// --- Mocks ---------------------------------------------------------------

const prismaMock = mockDeep<{
  project: {
    findUnique: (...args: unknown[]) => Promise<unknown>;
  };
  generationJob: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: "user_123",
    email: "u@aiflex.com",
    name: "User",
    role: "user",
    plan: "premium",
  })),
  AuthError: class AuthError extends Error {
    public status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/agent", () => ({
  orchestrateGeneration: vi.fn(async () => {}),
}));

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(async () => {}),
}));

const createOneShotCheckoutMock = vi.fn(async () => "https://checkout.stripe.test/s_123");
vi.mock("@/lib/stripe-oneshot", () => ({
  createOneShotCheckout: createOneShotCheckoutMock,
}));

// The route imports these at module load, so we declare mocks before importing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/sequel/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/sequel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---------------------------------------------------------------

describe("POST /api/sequel — input validation", () => {
  it("400 when userPrompt missing", async () => {
    const res = await POST(req({ parentFilmId: "p1", format: "episode_5" }));
    expect(res.status).toBe(400);
  });

  it("400 when format is invalid", async () => {
    const res = await POST(
      req({ parentFilmId: "p1", format: "nope", userPrompt: "hi" })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/sequel — parent eligibility gates", () => {
  const validBody = {
    parentFilmId: "parent_1",
    format: "episode_5",
    userPrompt: "Trois mois plus tard...",
  };

  it("404 when parent not found", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(404);
  });

  it("400 when parent is not ready", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      status: "generating",
      allowSequels: true,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      _count: { sequels: 0 },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
  });

  it("403 when parent is private", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      status: "ready",
      allowSequels: true,
      isDisavowed: false,
      visibility: "private",
      sequelsUnlockAt: null,
      maxSequels: 100,
      _count: { sequels: 0 },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });

  it("403 when allowSequels is false", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      status: "ready",
      allowSequels: false,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      _count: { sequels: 0 },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });

  it("403 when parent was disavowed by its own creator (chain break)", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      status: "ready",
      allowSequels: true,
      isDisavowed: true, // creator retrieved the film from the extended universe
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      _count: { sequels: 0 },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });

  it("403 when sequelsUnlockAt is in the future (7-day cooldown)", async () => {
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2 days from now
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      status: "ready",
      allowSequels: true,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: future,
      maxSequels: 100,
      _count: { sequels: 0 },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.unlockAt).toBeDefined();
  });

  it("403 when maxSequels reached (anti-spam on viral films)", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      status: "ready",
      allowSequels: true,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      _count: { sequels: 100 }, // cap reached
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });

  it("403 when parent.allowPublicSequels is false AND user is not the owner", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      ownerId: "someone_else", // NOT the requester "user_123"
      status: "ready",
      allowSequels: true,
      allowPublicSequels: false,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      _count: { sequels: 0 },
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
  });

  it("200 when all gates pass", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      ownerId: "user_123",
      title: "Parent",
      status: "ready",
      allowSequels: true,
      allowPublicSequels: true,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      requireSequelApproval: false,
      notifyOnSequel: false,
      _count: { sequels: 5 },
    });
    prismaMock.generationJob.create.mockResolvedValueOnce({
      id: "job_1",
      status: "pending",
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobId).toBe("job_1");
    expect(json.priceCents).toBeGreaterThan(0);
  });

  it("200 returns checkoutUrl and parks job awaiting_payment when non-owner pays", async () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test";
    try {
      prismaMock.project.findUnique.mockResolvedValueOnce({
        id: "parent_1",
        ownerId: "someone_else", // not the requester — requires payment
        title: "Parent",
        status: "ready",
        allowSequels: true,
        allowPublicSequels: true,
        isDisavowed: false,
        visibility: "public",
        sequelsUnlockAt: null,
        maxSequels: 100,
        requireSequelApproval: false,
        notifyOnSequel: false,
        _count: { sequels: 0 },
      });
      prismaMock.generationJob.create.mockResolvedValueOnce({
        id: "job_pay",
        status: "awaiting_payment",
      });
      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("awaiting_payment");
      expect(json.checkoutUrl).toMatch(/checkout\.stripe\.test/);
      expect(createOneShotCheckoutMock).toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = prev;
    }
  });

  it("200 and returns requiresApproval when parent requires sequel approval", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "parent_1",
      ownerId: "user_123",
      title: "Parent",
      status: "ready",
      allowSequels: true,
      allowPublicSequels: true,
      isDisavowed: false,
      visibility: "public",
      sequelsUnlockAt: null,
      maxSequels: 100,
      requireSequelApproval: true,
      notifyOnSequel: false,
      _count: { sequels: 0 },
    });
    prismaMock.generationJob.create.mockResolvedValueOnce({
      id: "job_2",
      status: "pending",
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requiresApproval).toBe(true);
  });
});
