import "server-only";

// Email alerts via Resend (https://resend.com). Env-gated: with no key, we no-op
// to "demo" so the rest of the flow still works. This is the SIMPLE model —
// notify Belinda at her inbox. (Not "send as her" — that's a separate feature.)

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "The Green Room · Sage <onboarding@resend.dev>";
const ALERT_TO = process.env.ALERT_EMAIL; // Belinda's inbox

export const emailEnabled = !!apiKey && !!ALERT_TO;

export type SendResult = { mode: "live" | "demo"; reason?: string; id?: string };

export async function sendAlert(args: {
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  if (!apiKey || !ALERT_TO) {
    return { mode: "demo", reason: !apiKey ? "RESEND_API_KEY not set" : "ALERT_EMAIL not set" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: FROM,
      to: [ALERT_TO],
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { mode: "live", id: data.id };
}
