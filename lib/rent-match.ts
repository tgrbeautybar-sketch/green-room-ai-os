import { getState, setState } from "./store";
import { scanVenmoPayments, type VenmoPayment } from "./venmo";

// Pure rent-payment matching logic + the scan/persist/match orchestration,
// extracted from app/api/rent/check-payments/route.ts (regression-guarded by
// rent-match.test.ts) so the exact same pipeline can be reused by both the
// manual "Check Venmo payments" button and the Friday/Monday auto-remind
// cron (app/api/cron/rent-cycle/route.ts).

export type RentEntry = {
  id: string;
  name: string;
  type: string;
  amount: number;
  status: "paid" | "unpaid";
  note?: string;
  email?: string;
  phone?: string;
  venmoName?: string; // set when the renter's Venmo display name differs from their roster name
};

export type VenmoMatch = {
  renterId: string;
  renterName: string;
  type: string;
  rentAmount: number;
  detected: number;
  count: number;
  payers: string[];
  enough: boolean;
  alreadyPaid: boolean;
};

export type Unmatched = { payer: string; amount: number; date: string };

export type MatchResult = { matches: VenmoMatch[]; unmatched: Unmatched[] };

export type ScanResult = MatchResult & { scanOk: boolean; error?: string };

const pkey = (p: VenmoPayment) => `${p.payer.toLowerCase()}|${p.amount}|${(p.date || "").slice(0, 10)}`;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Precedence: if the renter has a Venmo display name on file, only an exact
// (case/whitespace-insensitive) match on that counts — it's the ground truth they gave us.
// Otherwise fall back to token equality on the roster name: first-name tokens must match,
// and if both sides have a last-name token, that must match too (stronger confirmation,
// avoids "John" matching every John on the roster).
function nameMatch(payer: string, entry: { name: string; venmoName?: string }): boolean {
  const p = norm(payer);
  if (!p) return false;

  // Defensive: even if a whitespace-only venmoName ever slipped through storage,
  // don't let it win over the name-based fallback below — norm() would reduce it
  // to "", which should never be treated as ground truth.
  const venmoName = norm(entry.venmoName ?? "");
  if (venmoName) return venmoName === p;

  const renter = norm(entry.name);
  if (!renter) return false;

  const pTokens = p.split(" ");
  const rTokens = renter.split(" ");
  if (pTokens[0] !== rTokens[0]) return false;

  if (pTokens.length > 1 && rTokens.length > 1) {
    return pTokens[pTokens.length - 1] === rTokens[rTokens.length - 1];
  }
  return true;
}

// Matches roster entries against a set of Venmo payments — SUMS per-renter
// (handles split payments), same semantics as the pre-extraction
// check-payments route. Only entries with at least one matching payment are
// returned in `matches`; everyone else is implicitly "no Venmo activity found."
export function computeMatches(entries: RentEntry[], recentPayments: VenmoPayment[]): MatchResult {
  const used = new Set<string>();
  const matches = entries
    .map(e => {
      const ps = recentPayments.filter(p => nameMatch(p.payer, e));
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

  const unmatched = recentPayments
    .filter(p => !used.has(pkey(p)))
    .map(p => ({ payer: p.payer, amount: p.amount, date: p.date }));

  return { matches, unmatched };
}

// Orchestrates: scan Belinda's inbox for new Venmo payments, merge them into
// the durable "venmo-payments" store (deduped, capped at the last 500 so
// deletions / Trash auto-empty never lose the record), then match against
// the roster within the current ~9-day rent period. Shared by the manual
// check-payments route and the auto-remind cron — both need the exact same
// scan → persist → match pipeline.
export async function scanPersistMatch(entries: RentEntry[]): Promise<ScanResult> {
  let scanned: VenmoPayment[] = [];
  let scanOk = true;
  let error: string | undefined;
  try {
    scanned = await scanVenmoPayments(45);
  } catch (err) {
    scanOk = false;
    error = err instanceof Error ? err.message : String(err);
  }

  const store = (await getState<{ payments: VenmoPayment[] }>("venmo-payments"))?.payments ?? [];
  if (scanOk && scanned.length > 0) {
    const seen = new Set(store.map(pkey));
    for (const p of scanned) {
      if (!seen.has(pkey(p))) {
        store.push(p);
        seen.add(pkey(p));
      }
    }
    await setState("venmo-payments", { payments: store.slice(-500) });
  }

  // Match within the current rent period (~9 days) so totals reflect THIS
  // week, not money from prior weeks. The full store is still persisted above.
  const cutoff = Date.now() - 9 * 24 * 3600 * 1000;
  const recent = store.filter(p => {
    const t = Date.parse(p.date || "");
    return Number.isNaN(t) ? true : t >= cutoff;
  });

  const { matches, unmatched } = computeMatches(entries, recent);
  return { matches, unmatched, scanOk, error };
}
