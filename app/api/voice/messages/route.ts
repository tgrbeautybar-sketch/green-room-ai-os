import { NextResponse } from "next/server";
import { listMessages } from "@/lib/store";

export const runtime = "nodejs";

// Read-only feed of messages Sage captured (auth-protected by proxy.ts).
export async function GET() {
  const messages = await listMessages(50);
  return NextResponse.json({ messages });
}
