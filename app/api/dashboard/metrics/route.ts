import { NextRequest, NextResponse } from "next/server";
import { listTransactions } from "@/lib/transactions";
import { computeMetrics, computeRent, type Metrics, type RentMetrics, type RentEntry, type RentPayment } from "@/lib/metrics";
import { vagaroEnabled } from "@/lib/vagaro";
import { safeGetState } from "@/lib/store";
import { DEFAULT_DASHBOARD_CONFIG, type DashboardConfig } from "@/lib/dashboard-config";
import { bookings as demoBookings, metricsFor as demoMetricsFor, dailySeries as demoSeriesFor } from "@/lib/demo/bookings";

export const runtime = "nodejs";

const WINDOWS = [7, 30, 90];
const RENT_PERIOD_DAYS = 9;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000).toISOString().slice(0, 10);
}

// GET ?window=7|30|90&preview=1 — never 500s. Sales mode is "demo" (preview
// requested), "live" (Vagaro connected), "csv" (imported sales present), or
// "empty" (nothing yet). Rent is computed independently of sales mode so a
// broken sales pipeline never blanks the rent section.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const winParam = Number(url.searchParams.get("window"));
  const win = WINDOWS.includes(winParam) ? winParam : 30;
  const preview = url.searchParams.get("preview") === "1";

  const rent = await safeComputeRent();

  if (preview) {
    const { dailySeries, coverage, ...metrics } = buildDemoMetrics(win);
    return NextResponse.json({ mode: "demo", window: win, metrics, rent, series: dailySeries, coverage });
  }

  const config = await safeGetState<DashboardConfig>("dashboard-config", DEFAULT_DASHBOARD_CONFIG);

  const to = toDateOnly(new Date());
  const from = addDays(to, -(win - 1));

  let rows: Awaited<ReturnType<typeof listTransactions>> = [];
  let error: string | null = null;
  try {
    rows = await listTransactions(from, to);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const mode: "live" | "csv" | "empty" = vagaroEnabled ? "live" : rows.length > 0 ? "csv" : "empty";
  const { dailySeries, coverage, ...metrics } = computeMetrics(rows, win, { cogsPct: config.cogsPct ?? undefined });

  return NextResponse.json({
    mode,
    window: win,
    metrics,
    rent,
    series: dailySeries,
    coverage,
    ...(error ? { error } : {}),
  });
}

type StoredRentEntry = RentEntry & { note?: string; email?: string; phone?: string };
type StoredVenmoPayment = RentPayment & { subject?: string };

async function safeComputeRent(): Promise<RentMetrics> {
  try {
    const roster = (await safeGetState<{ entries: StoredRentEntry[] }>("rent-roster", { entries: [] }))?.entries ?? [];
    const payments =
      (await safeGetState<{ payments: StoredVenmoPayment[] }>("venmo-payments", { payments: [] }))?.payments ?? [];
    return computeRent(roster, payments, RENT_PERIOD_DAYS);
  } catch {
    return { collected: 0, outstanding: 0, expected: 0, paidCount: 0, renterCount: 0 };
  }
}

// Adapts lib/demo/bookings' seeded demo data into the same Metrics shape the
// real ledger produces, so the page renders identically in demo mode.
function buildDemoMetrics(win: number): Metrics {
  const base = demoMetricsFor("all", win);
  const series = demoSeriesFor("all", win);
  const to = toDateOnly(new Date());
  const from = addDays(to, -(win - 1));
  const dailySeries = series.map((gross, i) => ({ date: addDays(from, i), gross }));

  const set = demoBookings.filter(b => b.daysAgo < win);
  const byService = new Map<string, number>();
  for (const b of set) byService.set(b.service.name, (byService.get(b.service.name) ?? 0) + b.price);
  let topName = "—";
  let topRev = -Infinity;
  for (const [name, rev] of byService) {
    if (rev > topRev) {
      topRev = rev;
      topName = name;
    }
  }
  const topService =
    set.length === 0 ? null : { name: topName, share: base.gross !== 0 ? Math.round((topRev / base.gross) * 100) : 0 };

  return {
    gross: base.gross,
    avgTicket: base.avgTicket,
    bookings: base.bookings,
    topService,
    repeatClientRate: base.bookings > 0 ? base.retention : null,
    cogs: base.cogs,
    net: base.net,
    dailySeries,
    coverage: { from, to, days: win },
  };
}
