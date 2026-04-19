import "server-only";

/**
 * Secret loader abstraction.
 *
 * Why: shipping `process.env.STRIPE_SECRET_KEY` directly to every caller
 * couples the code to one secret backend (env vars). Operators running
 * AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, or Doppler
 * want to swap that out without touching the call sites.
 *
 * The loader supports rotation: it caches values for `cacheTtlMs` and
 * re-fetches when expired. Call `invalidateSecret(name)` to force a
 * refresh after a rotation event.
 *
 * Built-in providers:
 *   - "env"   (default): reads `process.env[name]`
 *   - "file"  : reads `${SECRETS_DIR}/${name}` (k8s mounted secrets, vault-agent)
 *
 * For Vault / KMS / Secrets Manager: implement `SecretProvider` and
 * register it via `registerSecretProvider()` from your boot path.
 */

export interface SecretProvider {
  read(name: string): Promise<string | undefined>;
}

class EnvProvider implements SecretProvider {
  async read(name: string): Promise<string | undefined> {
    const v = process.env[name];
    return v == null || v === "" ? undefined : v;
  }
}

class FileProvider implements SecretProvider {
  constructor(private dir: string) {}
  async read(name: string): Promise<string | undefined> {
    try {
      const { promises: fs } = await import("node:fs");
      const path = await import("node:path");
      // Reject path-traversal-y names defensively.
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return undefined;
      const data = await fs.readFile(path.join(this.dir, name), "utf8");
      return data.trim();
    } catch {
      return undefined;
    }
  }
}

let provider: SecretProvider = process.env.SECRETS_DIR
  ? new FileProvider(process.env.SECRETS_DIR)
  : new EnvProvider();

export function registerSecretProvider(p: SecretProvider): void {
  provider = p;
  cache.clear();
}

interface CacheEntry {
  value?: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export async function getSecret(
  name: string,
  opts: { cacheTtlMs?: number; required?: boolean } = {}
): Promise<string | undefined> {
  const ttl = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const cached = cache.get(name);
  if (cached && now - cached.fetchedAt < ttl) {
    if (opts.required && !cached.value) {
      throw new Error(`Secret manquant: ${name}`);
    }
    return cached.value;
  }
  const value = await provider.read(name);
  cache.set(name, { value, fetchedAt: now });
  if (opts.required && !value) {
    throw new Error(`Secret manquant: ${name}`);
  }
  return value;
}

export function invalidateSecret(name: string): void {
  cache.delete(name);
}

/**
 * Rotation hook — schedule from a cron to drop the cache and force the
 * next read to pull fresh values from the upstream secret store.
 */
export function rotateAllCachedSecrets(): void {
  cache.clear();
}
