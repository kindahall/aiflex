/**
 * Unit tests for lib/watermark.ts signC2PA (V8 §19.3).
 *
 * We don't run c2patool — we verify that the wrapper degrades cleanly
 * when env vars are missing, which is the only behavior that matters
 * outside of an integration environment.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signC2PA } from "@/lib/watermark";

const ENV_BACKUP = {
  cert: process.env.C2PA_SIGNING_CERT_PATH,
  key: process.env.C2PA_SIGNING_KEY_PATH,
  bin: process.env.C2PA_TOOL_BIN,
};

beforeEach(() => {
  delete process.env.C2PA_SIGNING_CERT_PATH;
  delete process.env.C2PA_SIGNING_KEY_PATH;
});

afterEach(() => {
  if (ENV_BACKUP.cert) process.env.C2PA_SIGNING_CERT_PATH = ENV_BACKUP.cert;
  else delete process.env.C2PA_SIGNING_CERT_PATH;
  if (ENV_BACKUP.key) process.env.C2PA_SIGNING_KEY_PATH = ENV_BACKUP.key;
  else delete process.env.C2PA_SIGNING_KEY_PATH;
  if (ENV_BACKUP.bin) process.env.C2PA_TOOL_BIN = ENV_BACKUP.bin;
  else delete process.env.C2PA_TOOL_BIN;
});

describe("signC2PA — graceful no-op", () => {
  it("returns { signed: false } when cert + key env vars missing", async () => {
    const r = await signC2PA("/tmp/fake.mp4", {
      creatorUserId: "u_1",
      filmId: "f_1",
      model: "test-model",
      generatedAt: new Date(),
      promptHash: "abc",
    });
    expect(r.signed).toBe(false);
    expect(r.reason).toMatch(/SIGNING_CERT_PATH/);
  });

  it("returns { signed: false, reason } and never throws when c2patool is missing", async () => {
    process.env.C2PA_SIGNING_CERT_PATH = "/nonexistent/cert.pem";
    process.env.C2PA_SIGNING_KEY_PATH = "/nonexistent/key.pem";
    process.env.C2PA_TOOL_BIN = "this-binary-does-not-exist-anywhere";
    const r = await signC2PA("/tmp/fake.mp4", {
      creatorUserId: "u_1",
      filmId: "f_1",
      model: "test-model",
      generatedAt: new Date(),
      promptHash: "abc",
    });
    expect(r.signed).toBe(false);
    expect(typeof r.reason).toBe("string");
  });
});
