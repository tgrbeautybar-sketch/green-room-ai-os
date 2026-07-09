import { NextResponse } from "next/server";
import { venmoScanEnabled } from "@/lib/venmo";
import { getState } from "@/lib/store";
import { scanPersistMatch, type RentEntry } from "@/lib/rent-match";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!venmoScanEnabled) {
    return NextResponse.json({ enabled: false, matches: [], unmatched: [] });
  }

  const roster = await getState<{ entries: RentEntry[] }>("rent-roster");
  const entries = roster?.entries ?? [];

  const result = await scanPersistMatch(entries);
  if (!result.scanOk) {
    return NextResponse.json(
      { enabled: true, error: result.error, matches: [], unmatched: [] },
      { status: 502 }
    );
  }

  return NextResponse.json({ enabled: true, matches: result.matches, unmatched: result.unmatched });
}
