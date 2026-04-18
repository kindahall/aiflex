import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCronRequest } from "@/lib/cron-auth";

describe("verifyCronRequest", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalAllowed = process.env.CRON_ALLOWED_IPS;

  beforeEach(() => {
    process.env.CRON_SECRET = "valid-secret-at-least-12-chars";
    delete process.env.CRON_ALLOWED_IPS;
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.CRON_ALLOWED_IPS = originalAllowed;
  });

  function req(headers: Record<string, string>) {
    return new Request("https://example.com/api/cron", {
      method: "POST",
      headers,
    });
  }

  it("rejects when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;
    const result = verifyCronRequest(req({ "x-cron-secret": "anything" }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-secret-configured");
  });

  it("rejects a wrong secret", () => {
    const result = verifyCronRequest(req({ "x-cron-secret": "wrong" }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad-secret");
  });

  it("rejects a missing secret header", () => {
    const result = verifyCronRequest(req({}));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad-secret");
  });

  it("accepts the correct secret when no IP allowlist is set", () => {
    const result = verifyCronRequest(
      req({ "x-cron-secret": "valid-secret-at-least-12-chars" })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when IP allowlist is set and the request comes from a non-listed IP", () => {
    process.env.CRON_ALLOWED_IPS = "10.0.0.1,10.0.0.2";
    const result = verifyCronRequest(
      req({
        "x-cron-secret": "valid-secret-at-least-12-chars",
        "x-forwarded-for": "192.168.1.5",
      })
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ip-not-allowed");
  });

  it("accepts when IP allowlist is set and the request IP matches", () => {
    process.env.CRON_ALLOWED_IPS = "10.0.0.1,10.0.0.2";
    const result = verifyCronRequest(
      req({
        "x-cron-secret": "valid-secret-at-least-12-chars",
        "x-forwarded-for": "10.0.0.2",
      })
    );
    expect(result.ok).toBe(true);
  });

  it("honors x-real-ip as a fallback for x-forwarded-for", () => {
    process.env.CRON_ALLOWED_IPS = "10.0.0.1";
    const result = verifyCronRequest(
      req({
        "x-cron-secret": "valid-secret-at-least-12-chars",
        "x-real-ip": "10.0.0.1",
      })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when IP allowlist is set but no IP header is present", () => {
    process.env.CRON_ALLOWED_IPS = "10.0.0.1";
    const result = verifyCronRequest(
      req({ "x-cron-secret": "valid-secret-at-least-12-chars" })
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("ip-not-allowed");
  });

  it("uses timing-safe comparison (equal-length wrong secret still rejected)", () => {
    // Same length as the configured secret
    const sameLength = "X".repeat("valid-secret-at-least-12-chars".length);
    const result = verifyCronRequest(req({ "x-cron-secret": sameLength }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad-secret");
  });

  it("picks the first IP from a comma-separated x-forwarded-for", () => {
    process.env.CRON_ALLOWED_IPS = "10.0.0.1";
    const result = verifyCronRequest(
      req({
        "x-cron-secret": "valid-secret-at-least-12-chars",
        "x-forwarded-for": "10.0.0.1, 192.168.1.1, 172.16.0.1",
      })
    );
    expect(result.ok).toBe(true);
  });
});
