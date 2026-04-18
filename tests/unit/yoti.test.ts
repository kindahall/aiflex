/**
 * Unit tests for lib/yoti.ts (V8 §19.4).
 *
 * We don't hit the real Yoti API — fetch is stubbed. Validates :
 *   - isYotiConfigured guard
 *   - createYotiSession throws cleanly when not configured
 *   - getYotiSessionStatus parses the COMPLETED/FAILED states + age check
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";

const ENV_BACKUP = {
  apiKey: process.env.YOTI_API_KEY,
  sdkId: process.env.YOTI_SDK_ID,
};

// Generate a real RSA key once so signRsaSha256 doesn't blow up the
// "fetch is mocked" tests.
const { privateKey: TEST_PRIVATE_KEY_PEM } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: any;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("@/lib/yoti");
});

afterEach(() => {
  if (ENV_BACKUP.apiKey === undefined) delete process.env.YOTI_API_KEY;
  else process.env.YOTI_API_KEY = ENV_BACKUP.apiKey;
  if (ENV_BACKUP.sdkId === undefined) delete process.env.YOTI_SDK_ID;
  else process.env.YOTI_SDK_ID = ENV_BACKUP.sdkId;
  vi.unstubAllGlobals();
});

describe("isYotiConfigured", () => {
  it("false when neither env var is set", () => {
    delete process.env.YOTI_API_KEY;
    delete process.env.YOTI_SDK_ID;
    expect(mod.isYotiConfigured()).toBe(false);
  });

  it("false when only one env var is set", () => {
    process.env.YOTI_API_KEY = "x";
    delete process.env.YOTI_SDK_ID;
    expect(mod.isYotiConfigured()).toBe(false);
    process.env.YOTI_SDK_ID = "y";
    delete process.env.YOTI_API_KEY;
    expect(mod.isYotiConfigured()).toBe(false);
  });

  it("true when both are set", () => {
    process.env.YOTI_API_KEY = "x";
    process.env.YOTI_SDK_ID = "y";
    expect(mod.isYotiConfigured()).toBe(true);
  });
});

describe("createYotiSession", () => {
  it("throws when Yoti is not configured", async () => {
    delete process.env.YOTI_API_KEY;
    delete process.env.YOTI_SDK_ID;
    await expect(
      mod.createYotiSession({
        userId: "u_1",
        successUrl: "https://x",
        callbackUrl: "https://x",
      })
    ).rejects.toThrow(/not configured/i);
  });
});

describe("getYotiSessionStatus", () => {
  it("returns UNKNOWN when not configured", async () => {
    delete process.env.YOTI_API_KEY;
    delete process.env.YOTI_SDK_ID;
    const r = await mod.getYotiSessionStatus("session_x");
    expect(r.state).toBe("UNKNOWN");
    expect(r.ageVerified).toBe(false);
  });

  it("returns UNKNOWN when fetch fails (network down)", async () => {
    process.env.YOTI_API_KEY = TEST_PRIVATE_KEY_PEM;
    process.env.YOTI_SDK_ID = "sdk_x";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const r = await mod.getYotiSessionStatus("session_x");
    expect(r.state).toBe("UNKNOWN");
    expect(r.ageVerified).toBe(false);
  });

  it("parses COMPLETED + AGE_OVER:18 APPROVE as ageVerified=true", async () => {
    process.env.YOTI_API_KEY = TEST_PRIVATE_KEY_PEM;
    process.env.YOTI_SDK_ID = "sdk_x";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          state: "COMPLETED",
          user_tracking_id: "u_1",
          checks: [
            {
              type: "AGE_OVER",
              report: { recommendation: { value: "APPROVE" } },
            },
          ],
        }),
      })
    );
    const r = await mod.getYotiSessionStatus("session_x");
    expect(r.state).toBe("COMPLETED");
    expect(r.ageVerified).toBe(true);
    expect(r.userTrackingId).toBe("u_1");
  });

  it("parses FAILED → state FAILED, ageVerified false", async () => {
    process.env.YOTI_API_KEY = TEST_PRIVATE_KEY_PEM;
    process.env.YOTI_SDK_ID = "sdk_x";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: "FAILED" }),
      })
    );
    const r = await mod.getYotiSessionStatus("session_x");
    expect(r.state).toBe("FAILED");
    expect(r.ageVerified).toBe(false);
  });
});
