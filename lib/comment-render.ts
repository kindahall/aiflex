/**
 * Lightweight comment markup → safe HTML renderer (V8 §24.1).
 *
 * Subset supported:
 *   **bold**       → <strong>bold</strong>
 *   *italic*       → <em>italic</em>
 *   `code`         → <code>code</code>
 *   [text](url)    → <a href="url">text</a>   (only http/https)
 *   @username      → <a href="/u/username">@username</a>
 *   newlines       → <br>
 *
 * EVERYTHING else is HTML-escaped first so user input cannot inject script
 * or arbitrary markup. Designed for client + server use (no DOM dependencies).
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}

/**
 * Returns a safe HTML string ready to drop into `dangerouslySetInnerHTML`.
 * Length cap matches the comment model's max body (600 chars).
 */
export function renderCommentBody(input: string): string {
  // 1. Hard escape first
  let html = escapeHtml(input.slice(0, 600));

  // 2. Apply rich tokens — order matters: links before mentions to avoid
  //    chewing the URL when it contains an `@`.
  // Markdown link [text](http(s)://…) — no `javascript:` schemes
  html = html.replace(
    /\[([^\]\n]{1,80})\]\(((?:https?):\/\/[^\s)]+)\)/g,
    (_m, text, url) =>
      `<a href="${escapeAttr(url)}" target="_blank" rel="noopener nofollow">${text}</a>`
  );

  // Bold **x**
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  // Italic *x*
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  // Inline code `x`
  html = html.replace(/`([^`\n]+?)`/g, "<code>$1</code>");

  // Mentions @user (alphanumerics + dash/underscore)
  html = html.replace(
    /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]{2,30})/g,
    (_m, before, name) =>
      `${before}<a href="/u/${name}" class="text-flex-accent">@${name}</a>`
  );

  // Newlines → <br>
  html = html.replace(/\n/g, "<br>");

  return html;
}

/**
 * Extract the list of @-mentioned usernames so the caller can dispatch
 * notifications. Deduplicated, lowercased, capped at 5 to bound load.
 */
export function extractMentions(body: string): string[] {
  const matches = body.match(/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]{2,30})/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of matches) {
    const name = raw.replace(/^.*@/, "").toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= 5) break;
  }
  return result;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
