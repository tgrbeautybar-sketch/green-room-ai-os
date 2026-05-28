import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_API_KEY ? "claude-opus-4-7" : null,
  });
}
