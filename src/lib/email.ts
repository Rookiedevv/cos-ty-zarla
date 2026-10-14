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
  try {
    const p = provider();
    if (p === "gmail") return await viaGmail(msg);
    if (p === "brevo") return await viaBrevo(msg);
    return false;
  } catch (e) {
    console.error("email failed", e);
    return false;
  }
}

async function viaGmail(msg: Msg): Promise<boolean> {
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
  return true;
}

async function viaBrevo(msg: Msg): Promise<boolean> {
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
  if (!res.ok) {
    console.error("email failed", res.status, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}
