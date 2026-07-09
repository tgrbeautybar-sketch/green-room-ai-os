import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getState } from "@/lib/store";
import { scanPersistMatch, type RentEntry, type VenmoMatch } from "@/lib/rent-match";
import {
  currentCycleId,
  phaseForToday,
  getCycle,
  saveCycle,
  classifyRenter,
  type RentCycle,
  type CyclePhase,
  type SendMode,
  type LastRun,
} from "@/lib/rent-cycle";
import { reminderText, buildOwnerSummary } from "@/lib/rent-email";
import { sendEmail, sendAlert, emailSendEnabled } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

type AutomationState = { autoRemind: boolean };

// Auth mirrors app/api/hooks/vagaro-transaction/route.ts: this cron sends
// real reminder emails on Belinda's behalf, so an unset secret must fail
// CLOSED in production (an open cron would let anyone trigger a mass email
// blast just by hitting the URL) — open in dev only, before CRON_SECRET is
// provisioned on Vercel.
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // no secret = open in dev only
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;
  return secretsMatch(provided, secret);
}

function baseLastRun(phase: CyclePhase, sendMode: SendMode, at: string): LastRun {
  return {
    at,
    phase,
    reminded: 0,
    manuallyPaid: 0,
    detectedPaid: 0,
    partial: 0,
    needsText: 0,
    scanOk: true,
    automationOn: true,
    sendMode,
  };
}

// Vercel Cron calls this via GET on the schedule in vercel.json. Every branch
// past auth returns 200 — a "nothing to do today" no-op is not a failure,
// and a non-200 would make Vercel log/alert on it as though it were one.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const automation = await getState<AutomationState>("rent-automation");
  if (!automation?.autoRemind) {
    // Fully inert when off — don't touch lastRun, so the Rent Roll card keeps
    // showing whatever the last real (automation-on) run reported.
    return NextResponse.json({ ok: true, skipped: "off" });
  }

  const phase = phaseForToday();
  if (!phase) {
    return NextResponse.json({ ok: true, skipped: "no-phase-day" });
  }

  const cycleId = currentCycleId();
  let cycle: RentCycle = (await getCycle()) ?? { cycleId };
  if (cycle.cycleId !== cycleId) {
    // New week's cycle — reset the phase records, but keep lastRun so the
    // status line still reflects the previous real run across the reset.
    cycle = { cycleId, lastRun: cycle.lastRun };
  }

  if (cycle[phase]) {
    return NextResponse.json({ ok: true, skipped: "phase-completed" });
  }

  const roster = await getState<{ entries: RentEntry[] }>("rent-roster");
  const entries = roster?.entries ?? [];
  const sendMode: SendMode = emailSendEnabled ? "live" : "disabled";
  const nowIso = new Date().toISOString();

  const scan = await scanPersistMatch(entries);
  if (!scan.scanOk) {
    cycle[phase] = { ranAt: nowIso, remindedIds: [], scanOk: false, error: scan.error };
    cycle.lastRun = { ...baseLastRun(phase, sendMode, nowIso), scanOk: false, error: scan.error };
    await saveCycle(cycle);
    await sendAlert({
      subject: "Rent auto-remind — Venmo check failed",
      text: "Couldn't check Venmo payments this morning — no reminders were sent automatically. Open Rent Roll to review manually.",
    }).catch(err => console.error("rent-cycle cron: owner alert failed", err));
    return NextResponse.json({ ok: true, scanOk: false });
  }

  const matchByRenter = new Map<string, VenmoMatch>(scan.matches.map(m => [m.renterId, m]));

  const manuallyPaid: RentEntry[] = [];
  const detectedPaid: { entry: RentEntry; detected: number }[] = [];
  const needsText: RentEntry[] = [];
  const partialCandidates: { entry: RentEntry; detected: number }[] = [];
  const fullCandidates: RentEntry[] = [];

  for (const entry of entries) {
    const match = matchByRenter.get(entry.id);
    const outcome = classifyRenter(entry, match, cycle, phase);
    if (outcome.action === "manuallyPaid") manuallyPaid.push(entry);
    else if (outcome.action === "detectedPaid") detectedPaid.push({ entry, detected: match?.detected ?? 0 });
    else if (outcome.action === "needsText") needsText.push(entry);
    else if (outcome.action === "send" && outcome.partial) partialCandidates.push({ entry, detected: match?.detected ?? 0 });
    else if (outcome.action === "send") fullCandidates.push(entry);
    // "skip" — already reminded this phase (defensive re-run guard); no bucket, no action.
  }

  const remindedIds: string[] = [];
  const reminded: RentEntry[] = [];

  if (sendMode === "live") {
    for (const entry of fullCandidates) {
      try {
        await sendEmail({ to: entry.email!, subject: "Rent reminder — The Green Room", text: reminderText(entry, phase) });
        remindedIds.push(entry.id);
        reminded.push(entry);
      } catch (err) {
        console.error(`rent-cycle cron: reminder send failed for renter ${entry.id}`, err);
      }
    }
    for (const p of partialCandidates) {
      try {
        await sendEmail({ to: p.entry.email!, subject: "Rent reminder — The Green Room", text: reminderText(p.entry, phase) });
        remindedIds.push(p.entry.id);
      } catch (err) {
        console.error(`rent-cycle cron: partial reminder send failed for renter ${p.entry.id}`, err);
      }
    }
  }

  cycle[phase] = { ranAt: nowIso, remindedIds, scanOk: true };
  cycle.lastRun = {
    at: nowIso,
    phase,
    reminded: reminded.length,
    manuallyPaid: manuallyPaid.length,
    detectedPaid: detectedPaid.length,
    partial: partialCandidates.length,
    needsText: needsText.length,
    scanOk: true,
    automationOn: true,
    sendMode,
  };
  await saveCycle(cycle);

  if (sendMode === "live") {
    const summary = buildOwnerSummary({
      phase,
      at: nowIso,
      reminded,
      manuallyPaid,
      detectedPaid,
      partial: partialCandidates,
      needsText,
    });
    await sendAlert(summary).catch(err => console.error("rent-cycle cron: owner summary alert failed", err));
  }

  return NextResponse.json({ ok: true, ...cycle.lastRun });
}
