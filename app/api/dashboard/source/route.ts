import { NextRequest, NextResponse } from "next/server";
import { safeGetState, setState } from "@/lib/store";
import { DEFAULT_DASHBOARD_CONFIG, type DashboardConfig } from "@/lib/dashboard-config";

export const runtime = "nodejs";

// Settings for the Salon Dashboard — kept at the app_state key
// "dashboard-config" (route path stays /api/dashboard/source since the page
// already calls it there). Everything here is optional: with nothing set,
// the dashboard just shows sales with no estimated-profit tiles.

export async function GET() {
  // Never 500 — if Supabase is unreachable, Belinda still gets a working
  // (unconfigured) dashboard instead of a broken settings panel.
  const config = await safeGetState<DashboardConfig | null>("dashboard-config", null);
  return NextResponse.json({ ...DEFAULT_DASHBOARD_CONFIG, ...(config ?? {}) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<DashboardConfig>;

  const existing =
    (await safeGetState<DashboardConfig | null>("dashboard-config", null)) ?? DEFAULT_DASHBOARD_CONFIG;
  const next: DashboardConfig = {
    cogsPct: "cogsPct" in body ? normalizePct(body.cogsPct) : existing.cogsPct,
    workingHours: "workingHours" in body ? normalizeHours(body.workingHours) : existing.workingHours,
    csvMapping: "csvMapping" in body ? body.csvMapping ?? null : existing.csvMapping,
  };

  try {
    await setState("dashboard-config", next);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "couldn't save settings" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, ...next });
}

function normalizePct(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function normalizeHours(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
