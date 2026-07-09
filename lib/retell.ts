import "server-only";

// Outbound SMS via Retell (https://api.retellai.com/create-sms-chat).
// Env-gated: inert until RETELL_API_KEY + RETELL_SMS_FROM are set AND the number
// passes A2P 10DLC. Until then, sends are skipped (no error).

const apiKey = process.env.RETELL_API_KEY;
const FROM = process.env.RETELL_SMS_FROM; // E.164, SMS-enabled, A2P-registered
const SMS_AGENT = process.env.RETELL_SMS_AGENT_ID; // chat/SMS agent for reminders
const VOICE_AGENT_ID = process.env.RETELL_VOICE_AGENT_ID ?? "agent_27978a74751cb1ff38ff51bc91";

export const retellSmsEnabled = !!apiKey && !!FROM;
export const retellCallsEnabled = !!apiKey;

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

// ---------- call log (list-calls) ----------
// Env-gated the same way as SMS: no key → retellCallsEnabled is false and callers
// show an honest not-connected state instead of hitting the network.
// Deliberately NOT fanning out to get-call per row — list-calls already returns
// everything the call log needs (summary, sentiment, transcript, recording).

export type RetellCall = {
  callId: string;
  direction: "inbound" | "outbound" | "unknown";
  fromNumber: string;
  toNumber: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  summary: string | null;
  sentiment: string | null;
  successful: boolean | null;
  transcript: string | null;
  recordingUrl: string | null;
  disconnectionReason: string | null;
};

type RawCallAnalysis = {
  call_summary?: unknown;
  user_sentiment?: unknown;
  call_successful?: unknown;
};

// Retell's list-calls payloads are not strictly typed on our side — every field
// is read defensively so a shape change degrades a row instead of throwing.
function normalizeCall(raw: Record<string, unknown>): RetellCall {
  const callId = str(raw.call_id) ?? str(raw.callId) ?? "";

  const dirRaw = (str(raw.direction) ?? "").toLowerCase();
  const direction: RetellCall["direction"] =
    dirRaw === "inbound" ? "inbound" : dirRaw === "outbound" ? "outbound" : "unknown";

  const startMs = num(raw.start_timestamp);
  const endMs = num(raw.end_timestamp);
  const startedAt = startMs != null ? new Date(startMs).toISOString() : null;
  const endedAt = endMs != null ? new Date(endMs).toISOString() : null;

  let durationSec: number | null = null;
  const durationMs = num(raw.duration_ms);
  if (durationMs != null) durationSec = Math.round(durationMs / 1000);
  else if (startMs != null && endMs != null && endMs >= startMs) durationSec = Math.round((endMs - startMs) / 1000);

  const analysis = (raw.call_analysis ?? {}) as RawCallAnalysis;
  const successfulRaw = analysis.call_successful;
  const successful = typeof successfulRaw === "boolean" ? successfulRaw : null;

  const transcriptRaw = raw.transcript;
  const transcript = typeof transcriptRaw === "string" && transcriptRaw.trim() ? transcriptRaw : null;

  return {
    callId,
    direction,
    fromNumber: str(raw.from_number) ?? "",
    toNumber: str(raw.to_number) ?? "",
    status: str(raw.call_status) ?? "unknown",
    startedAt,
    endedAt,
    durationSec,
    summary: str(analysis.call_summary),
    sentiment: str(analysis.user_sentiment),
    successful,
    transcript,
    recordingUrl: str(raw.recording_url),
    disconnectionReason: str(raw.disconnection_reason),
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function listCalls(limit = 20): Promise<RetellCall[]> {
  if (!apiKey) return [];

  const res = await fetch("https://api.retellai.com/v2/list-calls", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      filter_criteria: { agent_id: [VOICE_AGENT_ID] },
      limit,
      sort_order: "descending",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Retell list-calls failed (${res.status}): ${t.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => []);
  // Defensive: response may be a bare array, or a wrapper object holding the array.
  const rawCalls: unknown = Array.isArray(data)
    ? data
    : (data as { calls?: unknown })?.calls ?? [];
  if (!Array.isArray(rawCalls)) return [];

  return rawCalls
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map(normalizeCall);
}
