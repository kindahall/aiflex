import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  delivered: boolean;
  provider: "console" | "resend" | "postmark";
}

const DEFAULT_FROM = "AIflex <noreply@aiflex.app>";

/**
 * Provider-agnostic email send. In dev (no provider env vars set) we log
 * the message to the console and resolve OK so the rest of the auth flow
 * can be exercised without spending money or registering with a provider.
 *
 * Supported providers:
 *   - Resend  : set RESEND_API_KEY
 *   - Postmark: set POSTMARK_API_KEY (optionally POSTMARK_MESSAGE_STREAM,
 *               defaults to "outbound")
 *
 * The console fallback keeps everything working when no key is configured.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const provider = pickProvider();

  if (provider === "console") {
    // Pretty boxed output so the magic link is easy to copy from a noisy
    // dev log. The full message body is included on purpose.
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "┌──────────────────────────────────────────────────────────────",
        `│ 📧 [email:dev] To      : ${message.to}`,
        `│ 📧 [email:dev] Subject : ${message.subject}`,
        "│",
        ...message.text
          .split("\n")
          .map((l) => `│   ${l}`),
        "└──────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    );
    return { delivered: true, provider: "console" };
  }

  if (provider === "resend") {
    return sendViaResend(message);
  }

  if (provider === "postmark") {
    return sendViaPostmark(message);
  }

  return { delivered: false, provider };
}

// ── Postmark ───────────────────────────────────────────────────────────

async function sendViaPostmark(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.POSTMARK_API_KEY!;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const stream = process.env.POSTMARK_MESSAGE_STREAM || "outbound";

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        ...(message.html ? { HtmlBody: message.html } : {}),
        MessageStream: stream,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.warn(
        `[email:postmark] API error ${res.status}: ${body.slice(0, 300)}`
      );
      return { delivered: false, provider: "postmark" };
    }

    return { delivered: true, provider: "postmark" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[email:postmark] Network error:", err);
    return { delivered: false, provider: "postmark" };
  }
}

// ── Resend ────────────────────────────────────────────────────────────

async function sendViaResend(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.warn(
        `[email:resend] API error ${res.status}: ${body}`
      );
      return { delivered: false, provider: "resend" };
    }

    return { delivered: true, provider: "resend" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[email:resend] Network error:", err);
    return { delivered: false, provider: "resend" };
  }
}

// ── Provider selection ────────────────────────────────────────────────

function pickProvider(): SendResult["provider"] {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.POSTMARK_API_KEY) return "postmark";
  return "console";
}

/**
 * Build the absolute URL of a public route. Used to construct password
 * reset and email verification links inside the message bodies.
 *
 * In production, set NEXT_PUBLIC_APP_URL=https://aiflex.app so links
 * point at the right host.
 */
export function publicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const trimmed = base.replace(/\/$/, "");
  const route = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${route}`;
}
