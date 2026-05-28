import { NextResponse } from "next/server";
import { callScripts } from "@/lib/demo/calls";

export async function GET() {
  return NextResponse.json({ mode: "demo", sessions: callScripts });
}
