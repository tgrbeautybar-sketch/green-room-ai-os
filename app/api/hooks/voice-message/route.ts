import { NextRequest, NextResponse } from "next/server";
import { sendAlert } from "@/lib/email";
import { addMessage, CapturedMessage } from "@/lib/store";

export const runtime = "nodejs";

// Called by the voice agent (Retell) when Sage takes a message or a booking request.
// Public route (exempted from auth in proxy.ts) — secured with a shared secret.

function authorized(req: NextRequest): boolean {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured = open (dev)
  const provided = req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("key");
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Retell custom functions POST { call, name, args:{...} }; other callers may send fields at top level.
  const raw = (await req.json().catch(() => ({}))) as { args?: Record<string, unknown> } & Record<string, unknown>;
  const body = (raw.args ?? raw) as Partial<CapturedMessage> & { type?: string };

  const msg: CapturedMessage = {
    id: `msg_${Date.now()}`,
    type: body.type === "booking" ? "booking" : "message",
    callerName: (body.callerName ?? "").toString().slice(0, 120) || "Unknown caller",
    phone: (body.phone ?? "").toString().slice(0, 40),
    service: (body.service ?? "").toString().slice(0, 200),
    preferredStylist: (body.preferredStylist ?? "").toString().slice(0, 120),
    note: (body.note ?? "").toString().slice(0, 2000),
    receivedAt: new Date().toISOString(),
  };

  // 1) Persist so nothing is ever lost.
  await addMessage(msg);

  // 2) Notify Belinda by email (no-ops to demo if not configured).
  const heading = msg.type === "booking" ? "New booking request" : "New message";
  const lines = [
    `${heading} via Sage (The Green Room front desk)`,
    "",
    `From:    ${msg.callerName}`,
    msg.phone ? `Phone:   ${msg.phone}` : "",
    msg.service ? `Service: ${msg.service}` : "",
    msg.preferredStylist ? `Stylist: ${msg.preferredStylist}` : "",
    msg.note ? `\nNote:\n${msg.note}` : "",
  ].filter(l => l !== "");

  let email;
  try {
    email = await sendAlert({ subject: `${heading} — ${msg.callerName}`, text: lines.join("\n") });
  } catch (err) {
    email = { mode: "error" as const, reason: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ ok: true, stored: msg.id, email });
}
