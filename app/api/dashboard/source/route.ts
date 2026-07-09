import { NextRequest, NextResponse } from "next/server";
import { safeGetState, setState } from "@/lib/store";

export const runtime = "nodejs";

type SourceMode = "demo" | "vagaro" | "csv";

type DataSource = {
  mode: SourceMode;
  fileName: string | null;
  rows: number | null;
  connectedAt: string | null;
};

const DEFAULT: DataSource = { mode: "demo", fileName: null, rows: null, connectedAt: null };
const MODES: SourceMode[] = ["demo", "vagaro", "csv"];

export async function GET() {
  // Never 500 here — if Supabase is unreachable, the dashboard just falls back
  // to the demo data source instead of breaking the whole page.
  const s = await safeGetState<DataSource | null>("dashboard-source", null);
  return NextResponse.json({ ...DEFAULT, ...(s ?? {}) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<DataSource>;
  if (!body.mode || !MODES.includes(body.mode)) {
    return NextResponse.json({ error: "mode must be demo | vagaro | csv" }, { status: 400 });
  }

  const record: DataSource = {
    mode: body.mode,
    fileName: body.mode === "csv" ? body.fileName ?? null : null,
    rows: body.mode === "csv" ? body.rows ?? null : null,
    connectedAt: body.mode === "demo" ? null : new Date().toISOString(),
  };

  await setState("dashboard-source", record);
  return NextResponse.json({ ok: true, ...record });
}
