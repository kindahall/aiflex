/**
 * Integration tests for POST /api/advertise/lead (V8 §A4).
 *
 * Validates the lead-capture form: required fields, email format,
 * format whitelist, persistence shape.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

const prismaMock = mockDeep<{
  adLead: {
    create: (...a: unknown[]) => Promise<unknown>;
  };
}>();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// Bypass the rate limiter — it would otherwise fail open after 5 calls
vi.mock("@/lib/rate-limit", async () => {
  return {
    reportLimiter: {},
    checkPerScope: vi.fn(async () => ({ limit: 5, remaining: 4, reset: 0 })),
    RateLimitError: class extends Error {},
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;

beforeEach(async () => {
  mockReset(prismaMock);
  vi.resetModules();
  const mod = await import("@/app/api/advertise/lead/route");
  POST = mod.POST;
});

function req(body: Record<string, unknown>): Request {
  return new Request("http://test/api/advertise/lead", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/advertise/lead", () => {
  it("400 when required fields are missing", async () => {
    const res = await POST(req({ contactName: "X" }));
    expect(res.status).toBe(400);
    expect(prismaMock.adLead.create).not.toHaveBeenCalled();
  });

  it("400 on bad email format", async () => {
    const res = await POST(
      req({
        companyName: "Acme",
        contactName: "John",
        email: "not-an-email",
      })
    );
    expect(res.status).toBe(400);
  });

  it("persists with normalised email + filtered formats", async () => {
    prismaMock.adLead.create.mockResolvedValueOnce({});
    const res = await POST(
      req({
        companyName: "  Acme Inc  ",
        contactName: "John",
        email: "  Sales@Acme.COM  ",
        phone: "+33...",
        budgetCents: 500_000,
        formats: ["preroll_15", "midroll_30", "INVALID", "banner"],
        message: "We want a Q3 push.",
      })
    );
    expect(res.status).toBe(200);

    const call = prismaMock.adLead.create.mock.calls[0]?.[0] as
      | {
          data: {
            companyName: string;
            email: string;
            formats: string[];
            budgetCents: number | null;
            status: string;
          };
        }
      | undefined;
    expect(call?.data.companyName).toBe("Acme Inc");
    expect(call?.data.email).toBe("sales@acme.com");
    // INVALID stripped, the 3 known kept
    expect(call?.data.formats.sort()).toEqual([
      "banner",
      "midroll_30",
      "preroll_15",
    ]);
    expect(call?.data.budgetCents).toBe(500_000);
    expect(call?.data.status).toBe("new");
  });

  it("ignores zero / negative budget", async () => {
    prismaMock.adLead.create.mockResolvedValueOnce({});
    await POST(
      req({
        companyName: "Acme",
        contactName: "X",
        email: "x@acme.com",
        budgetCents: 0,
      })
    );
    const call = prismaMock.adLead.create.mock.calls[0]?.[0] as
      | { data: { budgetCents: number | null } }
      | undefined;
    expect(call?.data.budgetCents).toBeNull();
  });

  it("400 on invalid JSON", async () => {
    const badReq = new Request("http://test/api/advertise/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });
});
