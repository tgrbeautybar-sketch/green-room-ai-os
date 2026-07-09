import { NextResponse } from "next/server";
import { listMessages } from "@/lib/store";

export const runtime = "nodejs";

// Read-only feed of messages Sage captured (auth-protected by proxy.ts).
// Never 500s — if Supabase is unreachable, the feed just shows empty instead
// of breaking the whole page.
export async function GET() {
  try {
    const messages = await listMessages(50);
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
