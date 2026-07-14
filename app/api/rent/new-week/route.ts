import { NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";

// "Start a new week" for Belinda's Rent Roll — flips every renter back to
// unpaid and stamps a visible "week started" marker so she's tracking THIS
// week fresh. Decoupled from the Friday/Monday auto-remind cron: this is a
// manual reset she triggers herself, the cron never calls it.
//
// One concern per storage key: the statuses live in "rent-roster" (entries),
// the marker lives in "rent-week" (startedAt). We deliberately do NOT touch
// "rent-automation" (toggle) or "rent-cycle" (cron bookkeeping) here.

type RentEntry = {
  id: string;
  name: string;
  type: "chair" | "room";
  amount: number;
  status: "paid" | "unpaid";
  note?: string;
  email?: string;
  phone?: string;
  venmoName?: string;
};
type Roster = { entries: RentEntry[] };

export async function POST() {
  try {
    const roster = await getState<Roster>("rent-roster");
    const current = Array.isArray(roster?.entries) ? roster.entries : [];

    // Preserve every field verbatim — only the status resets. Do NOT
    // re-sanitize here: the roster POST route already normalized these fields
    // on the way in, and re-trimming/clamping now would risk silently mutating
    // data on a reset the user thinks is status-only.
    const entries: RentEntry[] = current.map(e => ({ ...e, status: "unpaid" as const }));

    // Write the roster FIRST, then the marker. Benign ordering: if the marker
    // write fails after the roster succeeds, statuses are still correctly reset
    // (the worse failure — marker set but statuses stale — can't happen).
    await setState("rent-roster", { entries });

    const startedAt = new Date().toISOString();
    await setState("rent-week", { startedAt });

    return NextResponse.json({ ok: true, entries, weekStartedAt: startedAt });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error });
  }
}
