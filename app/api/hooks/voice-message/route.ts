import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { sendAlert } from "@/lib/email";

export const runtime = "nodejs";

// Called by the voice agent (Retell) when Sage takes a message or a booking request.
// Public route (exempted from auth in proxy.ts) — secured with a shared secret instead,
// since an external service can't carry the owner's session cookie.

const STORE = path.join(process.cwd(), ".data", "messages.json");

type CapturedMessage = {
  id: string;
  type: "message" | "booking";
  callerName: string;
  phone: string;
  service: string;
  preferredStylist: string;
  note: string;
  receivedAt: string;
};

async function readAll(): Promise<CapturedMessage[]> {
  try {
    return JSON.parse(await fs.readFile(STORE, "utf-8")) as CapturedMessage[];
  } catch {
    return [];
  }
}

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

  const body = (await req.json().catch(() => ({}))) as Partial<CapturedMessage> & { type?: string };

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

  // 1) Persist so nothing is ever lost, regardless of email config.
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  const all = await readAll();
  all.unshift(msg);
  await fs.writeFile(STORE, JSON.stringify(all.slice(0, 500), null, 2), "utf-8");

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
