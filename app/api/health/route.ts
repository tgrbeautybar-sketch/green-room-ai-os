import { NextResponse } from "next/server";
import { getState } from "@/lib/store";
import { supabaseEnabled } from "@/lib/supabase";

export const runtime = "nodejs";

// Public + unauthenticated (see proxy.ts) so Vercel Cron can hit it on a schedule.
// The Supabase free tier auto-pauses a project after 7 days with no activity — a
// daily read here keeps it warm. Must never throw: a paused/unreachable database
// is reported, not a 500, since a dead health check would be worse than useless.
export async function GET() {
  // Only claim "ok" for a database that's actually configured — an unconfigured
  // Supabase env falls back to local files, which is a legitimate dev state
  // ("local"), not a healthy-but-unchecked database ("ok").
  let db: "ok" | "unavailable" | "local" = "local";
  if (supabaseEnabled) {
    try {
      await getState("rent-roster");
      db = "ok";
    } catch {
      db = "unavailable";
    }
  }

  return NextResponse.json({
    ok: true,
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_API_KEY ? "claude-opus-4-7" : null,
    db,
  });
}
