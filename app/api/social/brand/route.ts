import { NextRequest, NextResponse } from "next/server";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";

// Post Studio brand voice — editable notes that shape AI caption generation.
// Stored as the "brand-voice" key in the shared app_state table (no new table).
const MAX_CHARS = 20_000;

type Brand = { text: string; updatedAt: string | null };
const EMPTY: Brand = { text: "", updatedAt: null };

export async function GET() {
  const b = await getState<Brand>("brand-voice");
  return NextResponse.json({ ...EMPTY, ...(b ?? {}), saved: b != null });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { text?: string };
  const text = typeof body.text === "string" ? body.text : "";
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `brand voice too long (max ${MAX_CHARS} chars)` }, { status: 400 });
  }
  const record: Brand = { text, updatedAt: new Date().toISOString() };
  await setState("brand-voice", record);
  return NextResponse.json({ ok: true, ...record });
}
