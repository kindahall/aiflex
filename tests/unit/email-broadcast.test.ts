/**
 * Unit tests for lib/email-broadcast.ts (V8 §27.4).
 *
 * Critical: only users with explicit `newsletter` ConsentRecord
 * accepted=true should receive marketing — never auto opt-in by default.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  user: {
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
  consentRecord: {
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
  filmView: {
    findMany: (...a: unknown[]) => Promise<unknown[]>;
  };
  $queryRawUnsafe: (...a: unknown[]) => Promise<unknown[]>;
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const sendEmailMock = vi.fn(async (_p: Record<string, unknown>) => ({ delivered: true }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendBroadcast: any;

beforeEach(async () => {
  mockReset(prismaMock);
  sendEmailMock.mockClear();
  vi.resetModules();
  const mod = await import("@/lib/email-broadcast");
  sendBroadcast = mod.sendBroadcast;
});

describe("sendBroadcast — newsletter consent gate (CRITICAL)", () => {
  it("excludes users with NO ConsentRecord at all", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u_1", email: "a@x.com", name: "A" },
      { id: "u_2", email: "b@x.com", name: "B" },
    ]);
    prismaMock.consentRecord.findMany.mockResolvedValueOnce([]); // none opted in

    const result = await sendBroadcast({
      segment: "all",
      subject: "Hi",
      textBody: "x",
    });
    expect(result.recipients).toBe(0);
    expect(result.skipped).toBe(2);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("excludes users with explicit accepted=false", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u_1", email: "a@x.com", name: "A" },
    ]);
    prismaMock.consentRecord.findMany.mockResolvedValueOnce([
      { userId: "u_1", type: "newsletter", accepted: false, createdAt: new Date() },
    ]);
    const r = await sendBroadcast({ segment: "all", subject: "Hi", textBody: "x" });
    expect(r.recipients).toBe(0);
  });

  it("uses the LATEST consent decision per user", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u_1", email: "a@x.com", name: "A" },
    ]);
    // Two records, latest first (orderBy desc in the lib)
    prismaMock.consentRecord.findMany.mockResolvedValueOnce([
      { userId: "u_1", type: "newsletter", accepted: true, createdAt: new Date(2026, 3, 5) },
      { userId: "u_1", type: "newsletter", accepted: false, createdAt: new Date(2026, 0, 1) },
    ]);
    sendEmailMock.mockResolvedValueOnce({ delivered: true });
    const r = await sendBroadcast({ segment: "all", subject: "Hi", textBody: "x" });
    expect(r.recipients).toBe(1);
    expect(r.delivered).toBe(1);
  });

  it("sends to users with accepted=true (happy path)", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u_1", email: "alice@x.com", name: "Alice" },
    ]);
    prismaMock.consentRecord.findMany.mockResolvedValueOnce([
      { userId: "u_1", type: "newsletter", accepted: true, createdAt: new Date() },
    ]);
    sendEmailMock.mockResolvedValueOnce({ delivered: true });
    const r = await sendBroadcast({
      segment: "all",
      subject: "Welcome {{name}}",
      textBody: "Hi {{name}} ({{email}})",
    });
    expect(r.delivered).toBe(1);
    const call = sendEmailMock.mock.calls[0]?.[0] as
      | { to: string; subject: string; text: string }
      | undefined;
    expect(call?.to).toBe("alice@x.com");
    expect(call?.subject).toBe("Welcome Alice");
    expect(call?.text).toBe("Hi Alice (alice@x.com)");
  });
});

describe("sendBroadcast — segments", () => {
  it("dryRun never calls sendEmail", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u_1", email: "a@x.com", name: "A" },
    ]);
    prismaMock.consentRecord.findMany.mockResolvedValueOnce([
      { userId: "u_1", type: "newsletter", accepted: true, createdAt: new Date() },
    ]);
    const r = await sendBroadcast({
      segment: "all",
      subject: "x",
      textBody: "x",
      dryRun: true,
    });
    expect(r.dryRun).toBe(true);
    expect(r.recipients).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("inactive_14d excludes users with recent FilmView", async () => {
    // Two candidates; one of them has recent activity → excluded
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u_active", email: "act@x.com", name: "Active" },
      { id: "u_idle", email: "idle@x.com", name: "Idle" },
    ]);
    prismaMock.filmView.findMany.mockResolvedValueOnce([
      { userId: "u_active" },
    ]);
    prismaMock.consentRecord.findMany.mockResolvedValueOnce([
      { userId: "u_idle", type: "newsletter", accepted: true, createdAt: new Date() },
    ]);
    sendEmailMock.mockResolvedValueOnce({ delivered: true });

    const r = await sendBroadcast({
      segment: "inactive_14d",
      subject: "Come back",
      textBody: "...",
    });
    expect(r.recipients).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "idle@x.com" })
    );
  });
});
