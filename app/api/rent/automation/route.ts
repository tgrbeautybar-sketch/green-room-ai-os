import { NextRequest, NextResponse } from "next/server";
import { safeGetState, setState } from "@/lib/store";
import type { RentCycle } from "@/lib/rent-cycle";

export const runtime = "nodejs";

// Toggles the Friday/Monday auto-remind cron on/off for Belinda's Rent Roll.
// Protected by proxy.ts (not in the public exemptions list) — only she can
// flip this. The cron itself (app/api/cron/rent-cycle/route.ts) reads the
// same "rent-automation" key directly.

type AutomationState = { autoRemind: boolean };
const DEFAULT_AUTOMATION: AutomationState = { autoRemind: false };

async function currentState() {
  const automation = await safeGetState<AutomationState>("rent-automation", DEFAULT_AUTOMATION);
  const cycle = await safeGetState<RentCycle | null>("rent-cycle", null);
  return { autoRemind: automation.autoRemind, lastRun: cycle?.lastRun ?? null };
}

export async function GET() {
  return NextResponse.json(await currentState());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { autoRemind?: unknown };
  if (typeof body.autoRemind !== "boolean") {
    return NextResponse.json({ error: "autoRemind (boolean) required" }, { status: 400 });
  }

  await setState<AutomationState>("rent-automation", { autoRemind: body.autoRemind });
  return NextResponse.json(await currentState());
}
