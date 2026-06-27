import { NextResponse } from "next/server";
import { scanVenmoPayments, venmoScanEnabled, VenmoPayment } from "@/lib/venmo";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

type RentEntry = { id: string; name: string; type: string; amount: number; status: "paid" | "unpaid" };

const pkey = (p: VenmoPayment) => `${p.payer.toLowerCase()}|${p.amount}|${(p.date || "").slice(0, 10)}`;

function nameMatch(payer: string, renter: string): boolean {
  const p = payer.toLowerCase();
  const r = renter.toLowerCase().trim();
  if (!r) return false;
  return p.includes(r) || r.includes(p.split(/\s+/)[0]);
}

export async function GET() {
  if (!venmoScanEnabled) {
    return NextResponse.json({ enabled: false, matches: [], unmatched: [] });
  }

  const roster = await getState<{ entries: RentEntry[] }>("rent-roster");
  const entries = roster?.entries ?? [];

  let scanned: VenmoPayment[] = [];
  try {
    scanned = await scanVenmoPayments(45);
  } catch (err) {
    return NextResponse.json(
      { enabled: true, error: err instanceof Error ? err.message : String(err), matches: [], unmatched: [] },
      { status: 502 }
    );
  }

  // Persist every payment we've ever seen, so deletions / Trash auto-empty don't lose the record.
  const store = (await getState<{ payments: VenmoPayment[] }>("venmo-payments"))?.payments ?? [];
  const seen = new Set(store.map(pkey));
  for (const p of scanned) {
    if (!seen.has(pkey(p))) { store.push(p); seen.add(pkey(p)); }
  }
  await setState("venmo-payments", { payments: store.slice(-500) });

  // Match within the current rent period (~9 days) so totals reflect THIS week,
  // not money from prior weeks. The full store is still persisted above.
  const cutoff = Date.now() - 9 * 24 * 3600 * 1000;
  const recent = store.filter(p => {
    const t = Date.parse(p.date || "");
    return isNaN(t) ? true : t >= cutoff;
  });

  // Match per renter by SUMMING payments from name-matching payers (handles split payments).
  const used = new Set<string>();
  const matches = entries
    .map(e => {
      const ps = recent.filter(p => nameMatch(p.payer, e.name));
      ps.forEach(p => used.add(pkey(p)));
      const detected = ps.reduce((a, p) => a + p.amount, 0);
      return {
        renterId: e.id,
        renterName: e.name,
        type: e.type,
        rentAmount: e.amount,
        detected,
        count: ps.length,
        payers: [...new Set(ps.map(p => p.payer))],
        enough: ps.length > 0 && detected >= e.amount,
        alreadyPaid: e.status === "paid",
      };
    })
    .filter(m => m.count > 0);

  const unmatched = recent
    .filter(p => !used.has(pkey(p)))
    .map(p => ({ payer: p.payer, amount: p.amount, date: p.date }));

  return NextResponse.json({ enabled: true, matches, unmatched });
}
