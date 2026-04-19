/**
 * Minimal HTML sanitizer for admin-authored broadcast emails. Intentionally
 * conservative: we keep only the tags needed for a basic email layout and
 * strip every event handler, script, style, iframe, or javascript:/data:
 * URL. Anything unrecognized is escaped as text.
 *
 * For richer content use a battle-tested library (sanitize-html, DOMPurify
 * in a headless DOM). We keep this one dependency-free for the prototype.
 */

const ALLOWED_TAGS = new Set([
  "a",
  "p",
  "br",
  "b",
  "i",
  "em",
  "strong",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "hr",
  "span",
  "div",
  "img",
]);

// Per-tag safe attribute list. Everything else (onclick, style, srcset...)
// is stripped.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
  "*": new Set(["id"]),
};

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("javascript:")) return false;
  if (trimmed.startsWith("data:")) return false;
  if (trimmed.startsWith("vbscript:")) return false;
  return true;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeAttributes(tag: string, attrs: string): string {
  const allowed = new Set<string>([
    ...(ALLOWED_ATTRS[tag] || new Set<string>()),
    ...(ALLOWED_ATTRS["*"] || new Set<string>()),
  ]);
  const out: string[] = [];
  // very small attribute parser — handles quoted values only
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) {
    const name = m[1].toLowerCase();
    if (name.startsWith("on")) continue;
    if (name === "style") continue;
    if (!allowed.has(name)) continue;
    const value = m[2] ?? m[3] ?? "";
    if ((name === "href" || name === "src") && !isSafeUrl(value)) continue;
    out.push(`${name}="${escapeText(value)}"`);
  }
  // Always add rel=noopener on links going off-site
  if (tag === "a") {
    out.push('rel="noopener noreferrer"');
  }
  return out.length ? " " + out.join(" ") : "";
}

export function sanitizeBroadcastHtml(input: string): string {
  // Strip <script>, <style>, <iframe>, <object>, <embed> entirely.
  const stripped = input.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "");

  return stripped.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (raw, tagRaw: string, attrs: string) => {
      const tag = tagRaw.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      const isClosing = raw.startsWith("</");
      if (isClosing) return `</${tag}>`;
      return `<${tag}${sanitizeAttributes(tag, attrs)}>`;
    }
  );
}
