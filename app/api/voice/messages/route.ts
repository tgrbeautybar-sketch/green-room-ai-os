import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

// Read-only feed of messages Sage captured (auth-protected by proxy.ts).
const STORE = path.join(process.cwd(), ".data", "messages.json");

export async function GET() {
  try {
    const data = JSON.parse(await fs.readFile(STORE, "utf-8")) as unknown[];
    return NextResponse.json({ messages: data });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
