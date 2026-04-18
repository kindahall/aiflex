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
    expect(
      shouldBlockForCsrf(
        make({ method: "POST", pathname: "/api/agent/cron-check" })
      )
    ).toBe(false);
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

  it("also allows the request when Origin matches the Host header (no APP_URL)", () => {
    delete process.env.APP_URL;
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
