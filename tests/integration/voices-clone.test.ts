/**
 * Integration tests for /api/voices/clone (V8 §28.1 + §B1.4).
 *
 * Critical: voice cloning is biometric data — the route MUST refuse the
 * call when the consent flag is missing.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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

interface CloneRet {
  skipped: boolean;
  voiceId?: string;
  reason?: string;
}
const cloneMock = vi.fn(
  async (
    _userId: string,
    _buf: Buffer,
    _name: string,
    _label: string
  ): Promise<CloneRet> => ({ skipped: false, voiceId: "voice_xyz" })
);
const deleteMock = vi.fn(async (_userId: string) => {});
vi.mock("@/lib/voice-cloning", () => ({
  cloneVoiceForUser: cloneMock,
  deleteClonedVoice: deleteMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: Request) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DELETE: () => Promise<any>;

beforeEach(async () => {
  cloneMock.mockClear();
  deleteMock.mockClear();
  vi.resetModules();
  const mod = await import("@/app/api/voices/clone/route");
  POST = mod.POST;
  DELETE = mod.DELETE;
});

function buildForm(opts: {
  withFile?: boolean;
  withConsent?: boolean;
  voiceLabel?: string;
}): Request {
  const form = new FormData();
  if (opts.withFile !== false) {
    form.append("file", new Blob(["dummy"], { type: "audio/mpeg" }), "voice.mp3");
  }
  if (opts.withConsent) {
    form.append("consent", "1");
  }
  form.append("voiceLabel", opts.voiceLabel ?? "Test Voice");
  return new Request("http://test/api/voices/clone", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/voices/clone — biometric consent gate (CRITICAL)", () => {
  it("400 when no file uploaded", async () => {
    const res = await POST(buildForm({ withFile: false, withConsent: true }));
    expect(res.status).toBe(400);
    expect(cloneMock).not.toHaveBeenCalled();
  });

  it("400 when consent checkbox is NOT set — RGPD biometric guard", async () => {
    const res = await POST(buildForm({ withFile: true, withConsent: false }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/biom\u00e9trique|biometric|consent/i);
    expect(cloneMock).not.toHaveBeenCalled();
  });

  it("delegates to cloneVoiceForUser when consent + file are present", async () => {
    const res = await POST(buildForm({ withFile: true, withConsent: true }));
    expect(res.status).toBe(200);
    expect(cloneMock).toHaveBeenCalledWith(
      "u_1",
      expect.any(Buffer),
      expect.any(String),
      "Test Voice"
    );
    const data = await res.json();
    expect(data.voiceId).toBe("voice_xyz");
  });

  it("propagates skipped: true from the lib (e.g. no API key)", async () => {
    cloneMock.mockResolvedValueOnce({ skipped: true, reason: "no key" });
    const res = await POST(buildForm({ withFile: true, withConsent: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe(true);
  });
});

describe("DELETE /api/voices/clone", () => {
  it("delegates to deleteClonedVoice with the user id", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("u_1");
  });
});
