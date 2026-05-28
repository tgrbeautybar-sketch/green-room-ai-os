import { NextRequest, NextResponse } from "next/server";
import { metricsFor, dailySeries } from "@/lib/demo/bookings";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const stylistId = url.searchParams.get("stylistId") ?? "all";
  const win = Number(url.searchParams.get("window") ?? "30");
  return NextResponse.json({
    mode: "demo",
    stylistId,
    window: win,
    metrics: metricsFor(stylistId, win),
    series: dailySeries(stylistId, win),
  });
}
