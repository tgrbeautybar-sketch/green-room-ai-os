import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const STORE = path.join(process.cwd(), ".data", "knowledge-base.json");
const MAX_CHARS = 200_000;

type KnowledgeBase = {
  text: string;
  fileName: string | null;
  updatedAt: string | null;
};

const EMPTY: KnowledgeBase = { text: "", fileName: null, updatedAt: null };

async function ensureDir() {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
}

export async function GET() {
  try {
    const raw = await fs.readFile(STORE, "utf-8");
    const data = JSON.parse(raw) as KnowledgeBase;
    return NextResponse.json({ ...EMPTY, ...data, saved: true });
  } catch {
    return NextResponse.json({ ...EMPTY, saved: false });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { text?: string; fileName?: string | null };
  const text = typeof body.text === "string" ? body.text : "";

  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `knowledge base too long (max ${MAX_CHARS} chars)` }, { status: 400 });
  }

  const record: KnowledgeBase = {
    text,
    fileName: body.fileName ?? null,
    // Caller stamps time; server can't use Date in this harness reliably, so trust the client value if absent fall back to a marker.
    updatedAt: new Date().toISOString(),
  };

  await ensureDir();
  await fs.writeFile(STORE, JSON.stringify(record, null, 2), "utf-8");
  return NextResponse.json({ ok: true, ...record });
}
