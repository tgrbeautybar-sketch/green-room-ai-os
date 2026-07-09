import { NextRequest, NextResponse } from "next/server";
import { safeGetState, setState } from "@/lib/store";

export const runtime = "nodejs";

// Post Studio brand voice — editable notes that shape AI caption generation.
// Stored as the "brand-voice" key in the shared app_state table (no new table).
const MAX_CHARS = 20_000;

type Brand = { text: string; updatedAt: string | null };
const EMPTY: Brand = { text: "", updatedAt: null };

export async function GET() {
  // Never 500 here — if Supabase is unreachable, the panel just shows an empty,
  // unsaved brand voice instead of breaking the whole page.
  const b = await safeGetState<Brand | null>("brand-voice", null);
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
