import { describe, it, expect } from "vitest";
import { renderCommentBody, extractMentions } from "@/lib/comment-render";

describe("renderCommentBody", () => {
  it("escapes raw HTML before any markdown", () => {
    const out = renderCommentBody("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders bold and italic", () => {
    expect(renderCommentBody("**bold**")).toContain("<strong>bold</strong>");
    expect(renderCommentBody("*italic*")).toContain("<em>italic</em>");
  });

  it("renders inline code", () => {
    expect(renderCommentBody("`code`")).toContain("<code>code</code>");
  });

  it("renders safe links to http(s) only", () => {
    const safe = renderCommentBody("[click](https://aiflex.com)");
    expect(safe).toContain('href="https://aiflex.com"');
    expect(safe).toContain("rel=\"noopener nofollow\"");

    // javascript: scheme must NOT match — the regex only allows http/https
    const evil = renderCommentBody("[click](javascript:alert(1))");
    expect(evil).not.toContain("href=\"javascript:");
  });

  it("renders @mentions as profile links", () => {
    const out = renderCommentBody("hi @alice and @bob_42");
    expect(out).toContain('href="/u/alice"');
    expect(out).toContain('href="/u/bob_42"');
  });

  it("preserves newlines as <br>", () => {
    expect(renderCommentBody("line1\nline2")).toContain("line1<br>line2");
  });

  it("caps body length at 600 chars", () => {
    const big = "x".repeat(2000);
    const out = renderCommentBody(big);
    // Output is escaped (each x is one char), should be ~600 chars
    expect(out.length).toBeLessThan(700);
  });
});

describe("extractMentions", () => {
  it("returns deduplicated lowercase usernames", () => {
    const out = extractMentions("@Alice told @bob and @ALICE again");
    expect(out).toEqual(["alice", "bob"]);
  });

  it("caps at 5 mentions", () => {
    // 2-char names since single-letter ones are below the min length
    const text = "@a1 @b2 @c3 @d4 @e5 @f6 @g7";
    expect(extractMentions(text).length).toBe(5);
  });

  it("ignores mid-word @ references", () => {
    expect(extractMentions("email me at user@example.com")).toEqual([]);
  });

  it("requires at least 2 chars in name", () => {
    expect(extractMentions("hi @a there")).toEqual([]);
    expect(extractMentions("hi @ab there")).toEqual(["ab"]);
  });
});
