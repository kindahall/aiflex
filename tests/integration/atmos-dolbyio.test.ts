/**
 * Wave 11.1 — Live-credential end-to-end test against the Dolby.io
 * Media API. The client in `lib/atmos-providers.ts` is built to the
 * public docs but has not been exercised against the real service in
 * CI. This test bridges that gap.
 *
 * Cost control:
 *   - One 5-second silent+tone clip per run.
 *   - Dolby.io Atmos JOC transcoding is ~$0.30/output-minute → one run
 *     costs roughly $0.025. We log this estimate at the start so CI
 *     operators can see the running tab.
 *
 * Skip policy:
 *   - Skipped when DOLBY_IO_API_KEY / DOLBY_IO_API_SECRET are not set
 *     (the common CI case). To run locally:
 *       DOLBY_IO_API_KEY=... DOLBY_IO_API_SECRET=... \
 *         AIFLEX_ATMOS_PROVIDER=dolbyio \
 *         npx vitest run tests/integration/atmos-dolbyio.test.ts
 *   - Also skipped when ffmpeg/ffprobe are not on PATH (needed to
 *     prepare the source clip and inspect the output metadata).
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { transcodeToAtmos } from "@/lib/atmos-providers";

const HAS_CREDS = Boolean(process.env.DOLBY_IO_API_KEY && process.env.DOLBY_IO_API_SECRET);
const HAS_FFMPEG =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 &&
  spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

function ffmpegCmd(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn("ffmpeg", args, { stdio: "ignore" });
    c.on("error", reject);
    c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

function ffprobeField(file: string, entries: string): string {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a:0", "-show_entries", entries, "-of", "csv=p=0", file],
    { encoding: "utf8" }
  );
  return (r.stdout || "").trim();
}

describe.skipIf(!HAS_CREDS || !HAS_FFMPEG)("atmos-providers: Dolby.io live transcode", () => {
  let tmpDir = "";
  let sourcePath = "";
  let outPath = "";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aiflex-atmos-live-"));
    sourcePath = path.join(tmpDir, "src.mp4");
    outPath = path.join(tmpDir, "atmos-out.mp4");

    // 5-second source: black video + 440 Hz stereo sine. Short enough
    // that Dolby.io rounds to 1 output-minute of billing (~$0.025).
    await ffmpegCmd([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=640x360:r=24:d=5",
      "-f",
      "lavfi",
      "-i",
      "sine=f=440:d=5:sample_rate=48000",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      sourcePath,
    ]);

    // Force the provider so the test is self-contained (an operator
    // may have a different provider set in their shell).
    process.env.AIFLEX_ATMOS_PROVIDER = "dolbyio";

    // Cost visibility. $0.30/min × 1 min (5s rounded up) ≈ $0.025.
    // eslint-disable-next-line no-console
    console.info("[atmos-test] estimated cost: $0.025 (single 5s clip)");
  }, 60_000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it(
    "produces a real E-AC-3 JOC Atmos output from a 5-second clip",
    async () => {
      // The job can take a few minutes; the provider's internal deadline
      // is 15 min but a 5-second input usually lands inside 60-120s.
      const result = await transcodeToAtmos({
        inputPath: sourcePath,
        outputPath: outPath,
      });

      expect(result.real).toBe(true);
      expect(result.provider).toBe("dolbyio");
      if (!result.real) {
        // eslint-disable-next-line no-console
        console.error("[atmos-test] provider reason:", result.reason);
        return;
      }

      // When we're in webhook/async mode, the provider returns before
      // the file lands; skip the on-disk assertions and just verify the
      // job was accepted.
      if (result.pending) {
        expect(result.jobId).toBeTruthy();
        // eslint-disable-next-line no-console
        console.info(`[atmos-test] async job ${result.jobId} submitted — skipping file checks`);
        return;
      }

      // Sync mode: assert the E-AC-3 JOC output is on disk and valid.
      const stat = await fs.stat(outPath);
      expect(stat.size).toBeGreaterThan(10_000);

      const codec = ffprobeField(outPath, "stream=codec_name");
      expect(codec).toBe("eac3");

      const channels = parseInt(ffprobeField(outPath, "stream=channels"), 10);
      expect(channels).toBeGreaterThanOrEqual(8);

      const layout = ffprobeField(outPath, "stream=channel_layout");
      // Layout should surface the surround-plus-height structure Dolby
      // uses for Atmos beds (7.1, 5.1.4, etc.). We don't pin an exact
      // string because Dolby's mapping may evolve; we just want to see
      // *something* wider than 5.1 side.
      expect(layout).toMatch(/7\.1|5\.1\.[24]|atmos|JOC/i);

      // Metadata: look for a Dolby/JOC tag somewhere in the stream or
      // format comments. ffprobe surfaces container-level tags via -f.
      const tags =
        spawnSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format_tags:stream_tags",
            "-of",
            "default=noprint_wrappers=1",
            outPath,
          ],
          { encoding: "utf8" }
        ).stdout || "";
      expect(tags).toMatch(/Atmos|JOC|Dolby/i);
    },
    20 * 60_000
  );
});
