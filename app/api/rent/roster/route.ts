import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";

// Belinda's rent roster — independent stylists renting chairs/rooms.
// Stored as the "rent-roster" key in app_state (no new table).

type RentType = "chair" | "room";
type RentEntry = {
  id: string;
  name: string;
  type: RentType;
  amount: number;
  status: "paid" | "unpaid";
  note?: string;
  email?: string;
  phone?: string;
  venmoName?: string; // set when the renter's Venmo display name differs from their roster name
};
type Roster = { entries: RentEntry[] };

const EMPTY: Roster = { entries: [] };

export async function GET() {
  const r = await getState<Roster>("rent-roster");
  return NextResponse.json(r ?? EMPTY);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Roster;
  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "entries[] required" }, { status: 400 });
  }

  const entries: RentEntry[] = body.entries.slice(0, 300).map(e => ({
    id: String(e.id ?? "").slice(0, 48) || `r_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    name: String(e.name ?? "").slice(0, 120),
    type: e.type === "room" ? "room" : "chair",
    amount: Number.isFinite(e.amount) ? Math.max(0, Math.round(e.amount)) : 0,
    status: e.status === "paid" ? "paid" : "unpaid",
    note: e.note ? String(e.note).slice(0, 200) : undefined,
    email: e.email ? String(e.email).slice(0, 200) : undefined,
    phone: e.phone ? String(e.phone).slice(0, 40) : undefined,
    venmoName: e.venmoName ? String(e.venmoName).slice(0, 120) : undefined,
  }));

  await setState("rent-roster", { entries });
  return NextResponse.json({ ok: true, entries });
}
