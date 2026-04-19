/**
 * Lightweight in-app WAF — pattern-based detection of obvious attack
 * payloads in URL paths, query strings, and headers. Defense-in-depth
 * on top of any actual WAF (Cloudflare, AWS WAF) the operator deploys
 * in front; not a replacement.
 *
 * Caught:
 *   - Path traversal (`../`, encoded variants)
 *   - SQLi sentinel patterns (`' OR 1=1`, UNION SELECT, sleep())
 *   - XSS payloads (`<script>`, `javascript:`, on* handlers in URL)
 *   - Server-side template injection sentinels (`{{`, `${{`, `<%`)
 *   - Common log4shell-era JNDI probes (`${jndi:`)
 *
 * Returns the matched rule name when blocked, `null` when clean.
 */

const RULES: Array<{ name: string; re: RegExp; where: "path" | "query" | "header" | "any" }> = [
  // Path traversal
  { name: "path-traversal", re: /(\.\.[\\/]){2,}/i, where: "any" },
  { name: "path-traversal-encoded", re: /(%2e%2e[%/\\])/i, where: "any" },

  // SQLi sentinels
  { name: "sqli-or-1-eq-1", re: /['"]\s*or\s+\d+\s*=\s*\d+/i, where: "any" },
  { name: "sqli-union-select", re: /\bunion\s+(all\s+)?select\b/i, where: "any" },
  { name: "sqli-sleep", re: /\bsleep\s*\(\s*\d+\s*\)/i, where: "any" },
  { name: "sqli-benchmark", re: /\bbenchmark\s*\(/i, where: "any" },

  // XSS
  { name: "xss-script-tag", re: /<\s*script\b/i, where: "any" },
  { name: "xss-javascript-uri", re: /javascript:\s*[^\/]/i, where: "any" },
  { name: "xss-onerror", re: /\bon(error|load|click|focus)\s*=/i, where: "any" },

  // SSTI / template injection
  { name: "ssti-handlebars", re: /\{\{\s*[\w.]+\s*\}\}/, where: "query" },
  { name: "ssti-jsp", re: /<%[\s=][\s\S]*?%>/, where: "any" },

  // Log4shell
  { name: "jndi-probe", re: /\$\{jndi:/i, where: "any" },

  // Local-file inclusion
  { name: "lfi-etc-passwd", re: /(\/|%2f)etc(\/|%2f)passwd\b/i, where: "any" },
];

/** Headers we never inspect (always client-controlled, often noisy). */
const SKIP_HEADERS = new Set(["user-agent", "referer", "cookie", "authorization"]);

/**
 * Skip the WAF on routes that legitimately accept rich payloads. The
 * /api/agent/start endpoint, comment bodies, etc. moderate via the
 * AI-based moderator instead — running the regex WAF there would
 * generate massive false positives on any film with a hacker theme.
 */
const ALLOWLIST_PATHS: RegExp[] = [
  /^\/api\/agent\/start$/,
  /^\/api\/scene-video$/,
  /^\/api\/sequel$/,
  /^\/api\/projects\/[^/]+\/comments$/,
  /^\/api\/dms\b/,
  /^\/api\/upload(\/|$)/,
  /^\/api\/admin\/broadcast$/,
  /^\/api\/me\/profile$/,
  /^\/api\/report$/,
  /^\/api\/report-error$/,
  /^\/api\/auth\//,
];

export interface WafRequest {
  nextUrl: { pathname: string; search: string };
  headers: { entries(): IterableIterator<[string, string]> };
}

export function wafScan(
  req: WafRequest
): { blocked: false } | { blocked: true; rule: string; where: string } {
  const path = req.nextUrl.pathname;

  if (ALLOWLIST_PATHS.some((re) => re.test(path))) return { blocked: false };

  const search = req.nextUrl.search || "";
  for (const rule of RULES) {
    if (rule.where === "path" || rule.where === "any") {
      if (rule.re.test(path)) return { blocked: true, rule: rule.name, where: "path" };
    }
    if (rule.where === "query" || rule.where === "any") {
      if (search && rule.re.test(decodeURIComponent(search))) {
        return { blocked: true, rule: rule.name, where: "query" };
      }
    }
    if (rule.where === "header" || rule.where === "any") {
      for (const [name, value] of req.headers.entries()) {
        const lower = name.toLowerCase();
        if (SKIP_HEADERS.has(lower)) continue;
        if (rule.re.test(value)) {
          return { blocked: true, rule: rule.name, where: `header:${lower}` };
        }
      }
    }
  }
  return { blocked: false };
}
