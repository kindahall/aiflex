/**
 * Integration tests for GET /api/me/export (V8 §19.7 — RGPD).
 *
 * Critical: the export must NEVER include secrets (passwordHash, totpSecret,
 * parentalPin) and must include all 14 categories of personal data listed
 * in the route comment.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  like: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  comment: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  filmView: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  creatorPayout: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  tip: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  pushSubscription: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  consentRecord: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  moderationLog: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  report: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  profile: { findMany: (...a: unknown[]) => Promise<unknown[]> };
  session: { findMany: (...a: unknown[]) => Promise<unknown[]> };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/server-db", () => ({
  listProjectsByOwner: vi.fn(async () => [{ id: "p_1", title: "Mine" }]),
  listNotifications: vi.fn(async () => [{ id: "n_1" }]),
  listWatchlist: vi.fn(async () => [{ id: "w_1" }]),
  findUserById: vi.fn(async () => ({
    id: "u_1",
    email: "a@x.com",
    name: "Alice",
    passwordHash: "SECRET_HASH", // must be stripped
    totpSecret: "TOTP_SECRET",   // must be stripped
    totpBackupCodes: ["x"],      // must be stripped
    parentalPin: "1234",          // must be stripped
    createdAt: new Date(),
    role: "user",
  })),
  toPublicUser: vi.fn((u: Record<string, unknown>) => ({ ...u })),
}));

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
    email: "a@x.com",
    name: "Alice",
    role: "user",
  })),
  AuthError: MockAuthError,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: () => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  // Default empty arrays for all entities
  prismaMock.like.findMany.mockResolvedValue([]);
  prismaMock.comment.findMany.mockResolvedValue([]);
  prismaMock.filmView.findMany.mockResolvedValue([]);
  prismaMock.creatorPayout.findMany.mockResolvedValue([]);
  prismaMock.tip.findMany.mockResolvedValue([]);
  prismaMock.pushSubscription.findMany.mockResolvedValue([]);
  prismaMock.consentRecord.findMany.mockResolvedValue([]);
  prismaMock.moderationLog.findMany.mockResolvedValue([]);
  prismaMock.report.findMany.mockResolvedValue([]);
  prismaMock.profile.findMany.mockResolvedValue([]);
  prismaMock.session.findMany.mockResolvedValue([]);
  const mod = await import("@/app/api/me/export/route");
  GET = mod.GET;
});

describe("GET /api/me/export — RGPD shape (CRITICAL)", () => {
  it("returns JSON with the 14 expected categories", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = JSON.parse(await res.text());
    expect(data).toHaveProperty("user");
    expect(data).toHaveProperty("projects");
    expect(data).toHaveProperty("watchlist");
    expect(data).toHaveProperty("notifications");
    expect(data).toHaveProperty("likes");
    expect(data).toHaveProperty("comments");
    expect(data).toHaveProperty("views");
    expect(data).toHaveProperty("payouts");
    expect(data).toHaveProperty("tips");
    expect(data).toHaveProperty("pushSubscriptions");
    expect(data).toHaveProperty("consents");
    expect(data).toHaveProperty("moderation");
    expect(data).toHaveProperty("reports");
    expect(data).toHaveProperty("profiles");
    expect(data).toHaveProperty("sessions");
  });

  it("STRIPS passwordHash / totpSecret / totpBackupCodes / parentalPin", async () => {
    const res = await GET();
    const data = JSON.parse(await res.text());
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.user.totpSecret).toBeUndefined();
    expect(data.user.totpBackupCodes).toBeUndefined();
    expect(data.user.parentalPin).toBeUndefined();
  });

  it("requests pushSubscription endpoints WITHOUT keys (p256dh / auth)", async () => {
    await GET();
    const call = prismaMock.pushSubscription.findMany.mock.calls[0]?.[0] as
      | { select: { endpoint: boolean; createdAt: boolean } }
      | undefined;
    expect(call?.select.endpoint).toBe(true);
    expect(call?.select.createdAt).toBe(true);
    // p256dh + auth must NOT be selected
    expect((call?.select as Record<string, unknown> | undefined)?.p256dh).toBeUndefined();
    expect((call?.select as Record<string, unknown> | undefined)?.auth).toBeUndefined();
  });

  it("requests Session WITHOUT the token field", async () => {
    await GET();
    const call = prismaMock.session.findMany.mock.calls[0]?.[0] as
      | { select: Record<string, boolean> }
      | undefined;
    expect(call?.select.token).toBeUndefined();
    expect(call?.select.id).toBe(true);
  });

  it("includes a Content-Disposition attachment header", async () => {
    const res = await GET();
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment/);
    expect(res.headers.get("Content-Disposition")).toContain("aiflex-data-u_1-");
  });

  it("includes formatVersion + RGPD article 20 reference", async () => {
    const res = await GET();
    const data = JSON.parse(await res.text());
    expect(data.formatVersion).toBe("2");
    expect(data.note).toMatch(/article 20|portabilité/i);
  });
});
