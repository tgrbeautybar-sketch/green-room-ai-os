import { NextRequest, NextResponse } from "next/server";
import { listCalls, retellCallsEnabled } from "@/lib/retell";

export const runtime = "nodejs";

// Call log for the Front Desk Agent page. Never 500s — the panel always gets a
// 200 with either calls, an empty list, or an error string to show Belinda.
// Protected by proxy.ts's default auth (this path is not under /api/hooks).
export async function GET(req: NextRequest) {
  if (!retellCallsEnabled) {
    return NextResponse.json({ enabled: false, calls: [] });
  }

  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.min(Math.floor(raw), 50)) : 20;

  try {
    const calls = await listCalls(limit);
    return NextResponse.json({ enabled: true, calls });
  } catch (err) {
    // Log the real error server-side only — the browser gets a generic token
    // so we never ship upstream error text (which can include Retell request
    // details) to the client. The page already renders friendly copy for any
    // `error` value regardless of what it says.
    console.error("GET /api/voice/calls:", err);
    return NextResponse.json({ enabled: true, error: "calls_unavailable", calls: [] }, { status: 200 });
  }
}
