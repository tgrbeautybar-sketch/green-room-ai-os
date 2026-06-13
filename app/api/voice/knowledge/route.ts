import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";

const MAX_CHARS = 200_000;

type KnowledgeBase = {
  text: string;
  fileName: string | null;
  updatedAt: string | null;
};

const EMPTY: KnowledgeBase = { text: "", fileName: null, updatedAt: null };

export async function GET() {
  const kb = await getState<KnowledgeBase>("knowledge-base");
  return NextResponse.json({ ...EMPTY, ...(kb ?? {}), saved: kb != null });
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
    updatedAt: new Date().toISOString(),
  };

  await setState("knowledge-base", record);
  return NextResponse.json({ ok: true, ...record });
}
