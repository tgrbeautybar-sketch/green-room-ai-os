import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

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
  const s = await getState<DataSource>("dashboard-source");
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
