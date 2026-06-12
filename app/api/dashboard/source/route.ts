import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const STORE = path.join(process.cwd(), ".data", "dashboard-source.json");

type SourceMode = "demo" | "vagaro" | "csv";

type DataSource = {
  mode: SourceMode;
  fileName: string | null; // for csv
  rows: number | null; // for csv
  connectedAt: string | null;
};

const DEFAULT: DataSource = { mode: "demo", fileName: null, rows: null, connectedAt: null };

const MODES: SourceMode[] = ["demo", "vagaro", "csv"];

async function ensureDir() {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
}

export async function GET() {
  try {
    const raw = await fs.readFile(STORE, "utf-8");
    const data = JSON.parse(raw) as DataSource;
    return NextResponse.json({ ...DEFAULT, ...data });
  } catch {
    return NextResponse.json(DEFAULT);
  }
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

  await ensureDir();
  await fs.writeFile(STORE, JSON.stringify(record, null, 2), "utf-8");
  return NextResponse.json({ ok: true, ...record });
}
