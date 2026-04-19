import "server-only";

/**
 * Timed-fetch wrapper for calls to external APIs (AI providers, Stripe,
 * Yoti, Apple JWKS, etc.).
 *
 * Why: native `fetch` has no default timeout. If `fal.ai` or an upstream
 * hangs, Node holds the socket open until the platform kills the
 * function — on long-running workers this is a silent memory leak that
 * eventually OOMs the process.
 *
 * Usage:
 *   const res = await timedFetch(url, { method: "POST", body }, { timeoutMs: 15_000 });
 *   const data = await res.json();
 *
 * Retries are OPT-IN via `retry:` (exponential backoff, jittered). Only
 * enable them on idempotent requests.
 */

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
  retry?: { attempts: number; baseMs?: number };
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function isTransient(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export async function timedFetch(url: string | URL, init: FetchOpts = {}): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = init.retry?.attempts ?? 1;
  const baseMs = init.retry?.baseMs ?? 250;

  const { timeoutMs: _t, retry: _r, ...fetchInit } = init;

  // Pinned-cert dispatcher (if any) for security-critical providers.
  // undici's fetch accepts `dispatcher` as a non-standard init field.
  const { pinnedDispatcherFor } = await import("./cert-pinning");
  const dispatcher = pinnedDispatcherFor(url);

  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const initWithDispatcher = dispatcher
        ? ({ ...fetchInit, signal, dispatcher } as RequestInit & {
            dispatcher: unknown;
          })
        : { ...fetchInit, signal };
      const res = await fetch(url, initWithDispatcher);
      if (!isTransient(res.status)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      const jitter = Math.floor(Math.random() * baseMs);
      await sleep(baseMs * 2 ** i + jitter);
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(String(lastErr));
}
