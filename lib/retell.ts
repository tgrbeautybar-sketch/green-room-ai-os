import "server-only";

// Outbound SMS via Retell (https://api.retellai.com/create-sms-chat).
// Env-gated: inert until RETELL_API_KEY + RETELL_SMS_FROM are set AND the number
// passes A2P 10DLC. Until then, sends are skipped (no error).

const apiKey = process.env.RETELL_API_KEY;
const FROM = process.env.RETELL_SMS_FROM; // E.164, SMS-enabled, A2P-registered
const SMS_AGENT = process.env.RETELL_SMS_AGENT_ID; // chat/SMS agent for reminders

export const retellSmsEnabled = !!apiKey && !!FROM;

export type SmsResult = { sent: boolean; reason?: string; id?: string };

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendSms(args: { to: string; variables?: Record<string, string> }): Promise<SmsResult> {
  if (!apiKey || !FROM) return { sent: false, reason: "Retell SMS not configured" };

  const body: Record<string, unknown> = { from_number: FROM, to_number: toE164(args.to) };
  if (SMS_AGENT) body.agent_id = SMS_AGENT;
  if (args.variables) body.dynamic_variables = args.variables;

  const res = await fetch("https://api.retellai.com/create-sms-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Retell SMS failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { chat_id?: string; sms_chat_id?: string };
  return { sent: true, id: data.chat_id ?? data.sms_chat_id };
}
