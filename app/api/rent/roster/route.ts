import { NextResponse } from "next/server";
import { rentRoll, rentSummary } from "@/lib/demo/payments";

export async function GET() {
  return NextResponse.json({ mode: "demo", roll: rentRoll, summary: rentSummary() });
}
