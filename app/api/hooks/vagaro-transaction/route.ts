import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { normalizeVagaroTransaction, type VagaroTransactionPayload } from "@/lib/vagaro";
import { upsertTransactions } from "@/lib/transactions";

export const runtime = "nodejs";

// Vagaro's Transaction webhook. Public route (exempted from auth in
// proxy.ts's /api/hooks prefix — Vagaro can't carry Belinda's session
// cookie), secured with a shared secret instead. Unlike
// app/api/hooks/voice-message/route.ts (which stays open with no secret —
// Retell calls it today, closing it would break live message capture), this
// route writes Belinda's sales ledger, so an unset secret must fail CLOSED in
// production rather than open (C-1) — the "no secret = open" convenience is
// dev-only, before Vagaro creds exist.
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.VAGARO_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // no secret = open in dev only
  const provided = req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("key");
  if (!provided) return false;
  return secretsMatch(provided, secret);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // A malformed body is "poison" — retrying it will never succeed, so we ack
  // with 200 and log it rather than make Vagaro hammer us with the same
  // unparseable payload for 15 minutes.
  let payload: VagaroTransactionPayload;
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object") throw new Error("empty or non-object body");
    payload = raw as VagaroTransactionPayload;
  } catch (err) {
    console.error("vagaro-transaction: malformed payload", err);
    return NextResponse.json({ ok: false, error: "malformed payload" }, { status: 200 });
  }

  let txn;
  try {
    txn = normalizeVagaroTransaction(payload, "vagaro-webhook");
  } catch (err) {
    console.error("vagaro-transaction: couldn't normalize payload", payload, err);
    return NextResponse.json({ ok: false, error: "malformed payload" }, { status: 200 });
  }

  // A storage failure is different — the sale is real and must not be lost,
  // so we 500 and let Vagaro's retry policy (5x over 15 min) do its job.
  try {
    await upsertTransactions([txn]);
  } catch (err) {
    console.error("vagaro-transaction: storage failed", err);
    return NextResponse.json({ ok: false, error: "storage failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: txn.id });
}
