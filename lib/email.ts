import "server-only";
import nodemailer from "nodemailer";

// Email sending. Preference order:
//   1. Gmail SMTP (sends FROM Belinda's own Gmail, to anyone — needs an App Password)
//   2. Resend (needs a verified domain to reach arbitrary recipients)
//   3. demo no-op
// All env-gated so the app works with none configured.

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
const gmailEnabled = !!GMAIL_USER && !!GMAIL_APP_PASSWORD;

const resendKey = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.EMAIL_FROM || "The Green Room · Sage <onboarding@resend.dev>";
const ALERT_TO = process.env.ALERT_EMAIL; // where Sage's message alerts go

export const emailSendEnabled = gmailEnabled || !!resendKey;
export const emailEnabled = emailSendEnabled && !!ALERT_TO;

export type SendResult = { mode: "live" | "demo"; via?: "gmail" | "resend"; reason?: string; id?: string };

let gmailTransport: nodemailer.Transporter | null = null;
function transport() {
  if (!gmailEnabled) return null;
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER!, pass: GMAIL_APP_PASSWORD! },
    });
  }
  return gmailTransport;
}

// Send to ANY recipient (e.g. a stylist). Gmail SMTP can reach anyone; Resend needs a verified domain.
export async function sendEmail(args: { to: string; subject: string; text: string }): Promise<SendResult> {
  if (!args.to) return { mode: "demo", reason: "no recipient email" };

  const t = transport();
  if (t) {
    await t.sendMail({
      from: `The Green Room Beauty Bar <${GMAIL_USER}>`,
      to: args.to,
      subject: args.subject,
      text: args.text,
    });
    return { mode: "live", via: "gmail" };
  }

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: RESEND_FROM, to: [args.to], subject: args.subject, text: args.text }),
    });
    if (!res.ok) {
      const tx = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${tx.slice(0, 300)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { mode: "live", via: "resend", id: data.id };
  }

  return { mode: "demo", reason: "no email sender configured" };
}

// Notify Belinda at her inbox (Sage took a message).
export async function sendAlert(args: { subject: string; text: string }): Promise<SendResult> {
  const to = ALERT_TO || GMAIL_USER; // default alerts to the connected Gmail if no separate ALERT_EMAIL
  if (!to) return { mode: "demo", reason: "no alert recipient (set ALERT_EMAIL)" };
  return sendEmail({ to, subject: args.subject, text: args.text });
}
