import "server-only";

/*
  Two ways to send, set in Vercel:
  - Gmail:  GMAIL_USER + GMAIL_APP_PASSWORD (best for Gmail recipients: Google signs its own mail)
  - Brevo:  BREVO_API_KEY + EMAIL_FROM
  Gmail wins when both are set. EMAIL_FROM_NAME is the display name for either.
*/

type Msg = { to: string; subject: string; html: string; text: string };
const fromName = () => process.env.EMAIL_FROM_NAME || "Coś ty żarła";

function provider(): "gmail" | "brevo" | null {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "gmail";
  if (process.env.BREVO_API_KEY && process.env.EMAIL_FROM) return "brevo";
  return null;
}

/** True when an email service is set up in Vercel. */
export function emailConfigured(): boolean {
  return provider() != null;
}

/**
 * Sends one email. Returns false (and logs) on any problem,
 * so a failed email never breaks the job that sent it.
 */
export async function sendEmail(msg: Msg): Promise<boolean> {
  return (await sendEmailDetailed(msg)).ok;
}

/** Like sendEmail, but says why it failed (for the test button). */
export async function sendEmailDetailed(msg: Msg): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const p = provider();
    if (p === "gmail") await viaGmail(msg);
    else if (p === "brevo") await viaBrevo(msg);
    else return { ok: false, error: "not_configured" };
    return { ok: true };
  } catch (e) {
    console.error("email failed", e);
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
}

async function viaGmail(msg: Msg): Promise<void> {
  const { createTransport } = await import("nodemailer");
  const user = process.env.GMAIL_USER!;
  const transport = createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({ from: { name: fromName(), address: user }, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
}

async function viaBrevo(msg: Msg): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: fromName(), email: process.env.EMAIL_FROM },
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
