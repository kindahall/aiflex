import "server-only";
import { spawn } from "node:child_process";

/**
 * Thin ffprobe wrapper — just enough to get the duration of an MP4 for
 * upload pricing (V7 §3.4). No-op if ffprobe is missing; callers fall back
 * to file size as a proxy.
 */
export async function probeDurationSeconds(
  filePath: string
): Promise<number | null> {
  const bin = process.env.FFPROBE_BIN || "ffprobe";
  return new Promise((resolve) => {
    const proc = spawn(
      bin,
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    proc.stdout.on("data", (b) => (out += b.toString()));
    proc.on("error", () => resolve(null));
    proc.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      const duration = parseFloat(out.trim());
      resolve(Number.isFinite(duration) ? duration : null);
    });
  });
}
