// Pure metric calculations for the Salon Dashboard — no I/O, no Supabase, no
// fetch. Callers (the API route) fetch rows/roster/payments, then hand them
// here. Kept side-effect-free specifically so it's cheap to unit-test
// (see lib/metrics.test.ts) and safe to reuse anywhere metrics are needed.

import type { NormalizedTxn } from "./transactions";

// ---------- sales metrics ----------

export type TopService = { name: string; share: number } | null;

export type Coverage = { from: string; to: string; days: number };

export type Metrics = {
  gross: number;
  avgTicket: number;
  bookings: number;
  topService: TopService;
  repeatClientRate: number | null;
  cogs: number | null;
  net: number | null;
  dailySeries: { date: string; gross: number }[];
  coverage: Coverage;
};

export type MetricsOptions = {
  cogsPct?: number; // 0-100; omit to skip cogs/net entirely
  now?: Date; // testability hook — defaults to the real current time
};

// A repeat-client rate computed from 1-2 identified customers is noise, not a
// signal — Belinda would read "50%" as meaningful when it's really "1 of 2
// people happened to come back." Below this, we report null and let the UI
// show "not enough data yet" instead of a misleading percentage.
export const MIN_IDENTIFIED_CUSTOMERS = 3;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function daysBetweenDateStrs(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function computeMetrics(txns: NormalizedTxn[], window: number, options: MetricsOptions = {}): Metrics {
  const now = options.now ?? new Date();
  const to = toDateOnly(now);
  const from = addDaysToDateStr(to, -(window - 1));

  const inWindow = txns.filter(t => t.date >= from && t.date <= to);

  const gross = inWindow.reduce((sum, t) => sum + t.gross, 0);
  const bookings = inWindow.length;
  const avgTicket = bookings > 0 ? Math.round(gross / bookings) : 0;

  const topService = computeTopService(inWindow, gross);
  const repeatClientRate = computeRepeatClientRate(inWindow);

  const cogs = options.cogsPct != null ? Math.round(gross * (options.cogsPct / 100)) : null;
  const net = cogs != null ? gross - cogs : null;

  const dailySeries: { date: string; gross: number }[] = [];
  const byDate = new Map<string, number>();
  for (const t of inWindow) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.gross);
  for (let i = 0; i < window; i++) {
    const date = addDaysToDateStr(from, i);
    dailySeries.push({ date, gross: byDate.get(date) ?? 0 });
  }

  const coverage: Coverage =
    inWindow.length === 0
      ? { from, to, days: 0 }
      : (() => {
          const earliest = inWindow.reduce((min, t) => (t.date < min ? t.date : min), inWindow[0].date);
          return { from: earliest, to, days: daysBetweenDateStrs(earliest, to) + 1 };
        })();

  return { gross, avgTicket, bookings, topService, repeatClientRate, cogs, net, dailySeries, coverage };
}

function computeTopService(txns: NormalizedTxn[], totalGross: number): TopService {
  if (txns.length === 0) return null;

  const byItem = new Map<string, number>();
  for (const t of txns) {
    const name = t.itemName || "—";
    byItem.set(name, (byItem.get(name) ?? 0) + t.gross);
  }

  let topName = "—";
  let topRev = -Infinity;
  for (const [name, rev] of byItem) {
    if (rev > topRev) {
      topRev = rev;
      topName = name;
    }
  }

  const share = totalGross !== 0 ? Math.round((topRev / totalGross) * 100) : 0;
  return { name: topName, share };
}

function computeRepeatClientRate(txns: NormalizedTxn[]): number | null {
  const visitsByCustomer = new Map<string, Set<string>>();
  for (const t of txns) {
    if (!t.customerId) continue; // unidentified — excluded from the denominator entirely
    const dates = visitsByCustomer.get(t.customerId) ?? new Set<string>();
    dates.add(t.date);
    visitsByCustomer.set(t.customerId, dates);
  }

  const identifiedCount = visitsByCustomer.size;
  if (identifiedCount < MIN_IDENTIFIED_CUSTOMERS) return null;

  let repeatCount = 0;
  for (const dates of visitsByCustomer.values()) if (dates.size >= 2) repeatCount++;

  return repeatCount / identifiedCount;
}

// ---------- rent metrics ----------

export type RentEntry = {
  id: string;
  name: string;
  type: string;
  amount: number;
  status: "paid" | "unpaid";
  venmoName?: string;
};

export type RentPayment = { payer: string; amount: number; date: string };

export type RentMetrics = {
  collected: number;
  outstanding: number;
  expected: number;
  paidCount: number;
  renterCount: number;
};

export type RentOptions = { now?: Date };

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Mirrors the matching semantics in app/api/rent/check-payments/route.ts —
// exact venmoName match when the renter has one on file, else first+last
// name token match against the roster name. Duplicated (not imported)
// because that route isn't a shared module; keep both in sync if either changes.
function nameMatchesRentEntry(payer: string, entry: { name: string; venmoName?: string }): boolean {
  const p = normName(payer);
  if (!p) return false;

  const venmoName = normName(entry.venmoName ?? "");
  if (venmoName) return venmoName === p;

  const renter = normName(entry.name);
  if (!renter) return false;

  const pTokens = p.split(" ");
  const rTokens = renter.split(" ");
  if (pTokens[0] !== rTokens[0]) return false;
  if (pTokens.length > 1 && rTokens.length > 1) {
    return pTokens[pTokens.length - 1] === rTokens[rTokens.length - 1];
  }
  return true;
}

// periodDays mirrors the ~9-day rent period window check-payments uses, so a
// renter's payment from a prior week doesn't get counted against this week's rent.
export function computeRent(
  roster: RentEntry[],
  payments: RentPayment[],
  periodDays = 9,
  options: RentOptions = {}
): RentMetrics {
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - periodDays * 24 * 3600 * 1000;
  const recent = payments.filter(p => {
    const t = Date.parse(p.date || "");
    return Number.isNaN(t) ? true : t >= cutoff;
  });

  let expected = 0;
  let collected = 0;
  let paidCount = 0;

  for (const entry of roster) {
    expected += entry.amount;

    if (entry.status === "paid") {
      collected += entry.amount;
      paidCount++;
      continue;
    }

    if (entry.amount <= 0) continue;
    const detected = recent
      .filter(p => nameMatchesRentEntry(p.payer, entry))
      .reduce((sum, p) => sum + p.amount, 0);
    if (detected >= entry.amount) {
      collected += entry.amount;
      paidCount++;
    }
  }

  return { collected, outstanding: expected - collected, expected, paidCount, renterCount: roster.length };
}
