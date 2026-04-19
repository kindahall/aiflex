import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldBlockForCsrf } from "@/lib/csrf";

function make(opts: {
  method: string;
  pathname: string;
  origin?: string;
  host?: string;
  proto?: string;
}) {
  const headers = new Map<string, string>();
  if (opts.origin !== undefined) headers.set("origin", opts.origin);
  if (opts.host !== undefined) headers.set("host", opts.host);
  if (opts.proto !== undefined) headers.set("x-forwarded-proto", opts.proto);
  return {
    method: opts.method,
    nextUrl: { pathname: opts.pathname },
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
  };
}

describe("shouldBlockForCsrf", () => {
  const originalAppUrl = process.env.APP_URL;
  const originalPublicUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.APP_URL = "https://aiflex.app";
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  afterEach(() => {
    process.env.APP_URL = originalAppUrl;
    process.env.NEXT_PUBLIC_APP_URL = originalPublicUrl;
  });

  it("never blocks safe methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        shouldBlockForCsrf(
          make({ method, pathname: "/api/projects/1", origin: "https://evil.com" })
        )
      ).toBe(false);
    }
  });

  it("never blocks non-/api paths", () => {
    expect(
      shouldBlockForCsrf(
        make({ method: "POST", pathname: "/some/page", origin: "https://evil.com" })
      )
    ).toBe(false);
  });

  it("lets the Stripe webhook through (signed separately)", () => {
    expect(
      shouldBlockForCsrf(
        make({
          method: "POST",
          pathname: "/api/webhooks/stripe",
          origin: "https://stripe.com",
        })
      )
    ).toBe(false);
  });

  it("lets server-to-server requests without Origin through (cron, curl)", () => {
    expect(shouldBlockForCsrf(make({ method: "POST", pathname: "/api/agent/cron-check" }))).toBe(
      false
    );
  });

  it("blocks a cross-origin POST whose Origin doesn't match APP_URL", () => {
    expect(
      shouldBlockForCsrf(
        make({
          method: "POST",
          pathname: "/api/projects/1",
          origin: "https://evil.com",
        })
      )
    ).toBe(true);
  });

  it("allows a POST whose Origin matches APP_URL", () => {
    expect(
      shouldBlockForCsrf(
        make({
          method: "POST",
          pathname: "/api/projects/1",
          origin: "https://aiflex.app",
        })
      )
    ).toBe(false);
  });

  it("blocks requests when only the Host header matches (Host header not trusted by default)", () => {
    // Host header is attacker-controllable behind some reverse proxies, so
    // the check does NOT fall back to it unless the operator sets
    // CSRF_TRUST_REQUEST_HOST=1. This test documents the hardened default.
    delete process.env.APP_URL;
    delete process.env.ADDITIONAL_ALLOWED_ORIGINS;
    delete process.env.CSRF_TRUST_REQUEST_HOST;
    expect(
      shouldBlockForCsrf(
        make({
          method: "POST",
          pathname: "/api/projects/1",
          origin: "https://my-staging.example.com",
          host: "my-staging.example.com",
          proto: "https",
        })
      )
    ).toBe(true);
  });

  it("allows Host fallback only when CSRF_TRUST_REQUEST_HOST=1", () => {
    delete process.env.APP_URL;
    delete process.env.ADDITIONAL_ALLOWED_ORIGINS;
    process.env.CSRF_TRUST_REQUEST_HOST = "1";
    try {
      expect(
        shouldBlockForCsrf(
          make({
            method: "POST",
            pathname: "/api/projects/1",
            origin: "https://my-staging.example.com",
            host: "my-staging.example.com",
            proto: "https",
          })
        )
      ).toBe(false);
    } finally {
      delete process.env.CSRF_TRUST_REQUEST_HOST;
    }
  });

  it("blocks PATCH and DELETE the same way as POST", () => {
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      expect(
        shouldBlockForCsrf(
          make({
            method,
            pathname: "/api/projects/1",
            origin: "https://evil.com",
          })
        )
      ).toBe(true);
    }
  });

  it("strips a trailing slash on APP_URL when matching", () => {
    process.env.APP_URL = "https://aiflex.app/";
    expect(
      shouldBlockForCsrf(
        make({
          method: "POST",
          pathname: "/api/projects/1",
          origin: "https://aiflex.app",
        })
      )
    ).toBe(false);
  });
});
