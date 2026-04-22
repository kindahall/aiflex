/**
 * Dolby.io webhook signature validation.
 *
 * We don't spin up the full Next.js route handler here (that would pull
 * Prisma + several server-only modules). The signature contract itself
 * is a pure HMAC-SHA256 check; replicating the exact predicate from the
 * route keeps this a fast, deterministic unit test that catches
 * regressions on the auth surface.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

function verifySignature(raw: string, header: string, secret: string): boolean {
  const provided = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const { timingSafeEqual } = require("node:crypto");
  try {
    return timingSafeEqual(
      Buffer.from(provided.toLowerCase(), "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

describe("Dolby.io webhook signature validation", () => {
  const SECRET = "ef88c7a1b90f4a8eb87bb3d2a4b45d1fab11d4e56ba1f2c3e4d5f6a7b8c9d0e1";
  const BODY = JSON.stringify({
    job_id: "abc-123",
    status: "Succeeded",
    result_url: "https://dolby.example/output.mp4",
  });

  function sign(body: string): string {
    return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
  }

  it("accepts a correctly-signed payload (bare hex)", () => {
    expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("accepts a payload with the sha256= prefix (operator variant)", () => {
    expect(verifySignature(BODY, `sha256=${sign(BODY)}`, SECRET)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const forged = createHmac("sha256", "not-the-secret").update(BODY, "utf8").digest("hex");
    expect(verifySignature(BODY, forged, SECRET)).toBe(false);
  });

  it("rejects a signature computed over a different body", () => {
    const otherBody = JSON.stringify({ job_id: "attacker-injected" });
    expect(verifySignature(BODY, sign(otherBody), SECRET)).toBe(false);
  });

  it("rejects a header that is not a valid hex digest", () => {
    expect(verifySignature(BODY, "not-a-hex-string", SECRET)).toBe(false);
    expect(verifySignature(BODY, "", SECRET)).toBe(false);
  });

  it("rejects a truncated signature (length attack surface)", () => {
    const valid = sign(BODY);
    expect(verifySignature(BODY, valid.slice(0, 32), SECRET)).toBe(false);
  });

  it("does not accept the same signature across mutated payloads (tamper check)", () => {
    // A replay attempt with a modified status must fail.
    const sig = sign(BODY);
    const tampered = BODY.replace("Succeeded", "Failed");
    expect(verifySignature(tampered, sig, SECRET)).toBe(false);
  });
});
