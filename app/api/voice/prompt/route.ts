import { NextRequest, NextResponse } from "next/server";
import { defaultSystemPrompt } from "@/lib/demo/calls";
import { getState, setState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const text = await getState<string>("voice-prompt");
  return NextResponse.json({ prompt: text ?? defaultSystemPrompt, saved: text != null });
}

export async function POST(req: NextRequest) {
  const { prompt } = (await req.json()) as { prompt: string };
  if (typeof prompt !== "string" || prompt.length === 0) {
    return NextResponse.json({ error: "empty prompt" }, { status: 400 });
  }
  if (prompt.length > 20000) {
    return NextResponse.json({ error: "prompt too long (max 20000 chars)" }, { status: 400 });
  }
  await setState("voice-prompt", prompt);
  return NextResponse.json({ ok: true });
}
