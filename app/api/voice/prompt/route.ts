import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { defaultSystemPrompt } from "@/lib/demo/calls";

export const runtime = "nodejs";

const STORE = path.join(process.cwd(), ".data", "voice-prompt.txt");

async function ensureDir() {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
}

export async function GET() {
  try {
    const text = await fs.readFile(STORE, "utf-8");
    return NextResponse.json({ prompt: text, saved: true });
  } catch {
    return NextResponse.json({ prompt: defaultSystemPrompt, saved: false });
  }
}

export async function POST(req: NextRequest) {
  const { prompt } = (await req.json()) as { prompt: string };
  if (typeof prompt !== "string" || prompt.length === 0) {
    return NextResponse.json({ error: "empty prompt" }, { status: 400 });
  }
  if (prompt.length > 20000) {
    return NextResponse.json({ error: "prompt too long (max 20000 chars)" }, { status: 400 });
  }
  await ensureDir();
  await fs.writeFile(STORE, prompt, "utf-8");
  return NextResponse.json({ ok: true });
}
