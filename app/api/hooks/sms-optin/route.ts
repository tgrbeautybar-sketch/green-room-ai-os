import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";

// Public opt-in form submissions. Records a consent ledger (name, phone, timestamp)
// so there's a verifiable record of who agreed to receive SMS.
type OptIn = { name: string; phone: string; consent: boolean; at: string };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; consent?: boolean };
  if (!body.phone || !body.consent) {
    return NextResponse.json({ error: "phone and consent required" }, { status: 400 });
  }

  const record: OptIn = {
    name: String(body.name ?? "").slice(0, 120),
    phone: String(body.phone).slice(0, 40),
    consent: true,
    at: new Date().toISOString(),
  };

  const store = (await getState<{ optins: OptIn[] }>("sms-optins"))?.optins ?? [];
  store.push(record);
  await setState("sms-optins", { optins: store.slice(-1000) });

  return NextResponse.json({ ok: true });
}
