import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentAtmosProvider, transcodeToAtmos } from "@/lib/atmos-providers";

/**
 * Provider-resolution and no-op fallbacks are pure logic; the actual
 * HTTP requests to Dolby.io and the spawn of the local Reference
 * Encoder are only fired when credentials are present. Unit tests
 * cover the fallback paths without making any network calls.
 */

describe("atmos-providers", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AIFLEX_ATMOS_PROVIDER;
    delete process.env.DOLBY_IO_API_KEY;
    delete process.env.DOLBY_IO_API_SECRET;
    delete process.env.DOLBY_REFERENCE_ENCODER_PATH;
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it("resolves to 'none' when no env var is set", () => {
    expect(currentAtmosProvider()).toBe("none");
  });

  it("resolves to 'dolbyio' / 'reference' from AIFLEX_ATMOS_PROVIDER", () => {
    process.env.AIFLEX_ATMOS_PROVIDER = "dolbyio";
    expect(currentAtmosProvider()).toBe("dolbyio");
    process.env.AIFLEX_ATMOS_PROVIDER = "reference";
    expect(currentAtmosProvider()).toBe("reference");
  });

  it("ignores unknown provider ids and falls back to 'none'", () => {
    process.env.AIFLEX_ATMOS_PROVIDER = "does-not-exist";
    expect(currentAtmosProvider()).toBe("none");
  });

  it("transcodeToAtmos returns real=false / provider=none without env", async () => {
    const result = await transcodeToAtmos({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
    });
    expect(result.real).toBe(false);
    expect(result.provider).toBe("none");
    expect(result.reason).toMatch(/no atmos provider configured/i);
  });

  it("dolbyio provider without credentials fails gracefully", async () => {
    process.env.AIFLEX_ATMOS_PROVIDER = "dolbyio";
    const result = await transcodeToAtmos({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
    });
    expect(result.real).toBe(false);
    expect(result.provider).toBe("dolbyio");
    expect(result.reason).toMatch(/missing/i);
  });

  it("reference provider without encoder path fails gracefully", async () => {
    process.env.AIFLEX_ATMOS_PROVIDER = "reference";
    const result = await transcodeToAtmos({
      inputPath: "/tmp/in.mp4",
      outputPath: "/tmp/out.mp4",
    });
    expect(result.real).toBe(false);
    expect(result.provider).toBe("reference");
    expect(result.reason).toMatch(/not set/i);
  });
});

/**
 * SDK surface contract — we don't mock the real API (that's the Wave
 * 11.7 live-credential test) but we verify the package resolves and
 * exposes the entry points the provider expects. A regression here
 * would mean the SDK moved or renamed these exports.
 */
describe("atmos-providers: Dolby.io SDK compatibility", () => {
  it("@dolbyio/dolbyio-rest-apis-client exposes media.transcode.{start,getResults}", async () => {
    const sdk = await import("@dolbyio/dolbyio-rest-apis-client");
    expect(sdk.media).toBeDefined();
    expect(typeof sdk.media.transcode.start).toBe("function");
    expect(typeof sdk.media.transcode.getResults).toBe("function");
  });

  it("exposes media.io.{uploadFile,downloadFile} helpers", async () => {
    const sdk = await import("@dolbyio/dolbyio-rest-apis-client");
    expect(typeof sdk.media.io.uploadFile).toBe("function");
    expect(typeof sdk.media.io.downloadFile).toBe("function");
  });

  it("exposes media.authentication.getApiAccessToken", async () => {
    const sdk = await import("@dolbyio/dolbyio-rest-apis-client");
    expect(typeof sdk.media.authentication.getApiAccessToken).toBe("function");
  });
});
