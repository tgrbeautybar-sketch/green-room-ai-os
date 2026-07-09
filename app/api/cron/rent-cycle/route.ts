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
  reminderCopyPhase,
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
    sendFailed: 0,
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

  // Every read below is wrapped: a Supabase blip must degrade gracefully
  // (skip / treat-as-fresh / treat-as-empty), not 500 the cron and break the
  // "always 200 after auth" contract. All reads happen before any email is
  // sent, so a storage outage is caught up front rather than after emails
  // have already gone out.
  let automation: AutomationState | null;
  try {
    automation = await getState<AutomationState>("rent-automation");
  } catch (err) {
    console.error("rent-cycle cron: automation-toggle read failed; treating as off", err);
    automation = null;
  }
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
  let cycle: RentCycle;
  try {
    cycle = (await getCycle()) ?? { cycleId };
  } catch (err) {
    console.error("rent-cycle cron: cycle read failed; treating as a fresh cycle", err);
    cycle = { cycleId };
    // Storage may be down for both reads and writes — prove we can still
    // write BEFORE attempting any sends. Otherwise the incremental per-send
    // persistence below would fail mid-loop, which is worse than not
    // sending at all: a crash there means duplicate emails on the next run.
    try {
      await saveCycle(cycle);
    } catch (saveErr) {
      console.error("rent-cycle cron: storage unavailable for both read and write — aborting before any sends", saveErr);
      await sendAlert({
        subject: "Rent auto-remind — storage unavailable",
        text: "Couldn't reach storage this morning — no reminders were sent automatically. Open Rent Roll to review manually.",
      }).catch(alertErr => console.error("rent-cycle cron: owner alert failed", alertErr));
      return NextResponse.json({ ok: true, storageOk: false });
    }
  }
  if (cycle.cycleId !== cycleId) {
    // New week's cycle — reset the phase records, but keep lastRun so the
    // status line still reflects the previous real run across the reset.
    cycle = { cycleId, lastRun: cycle.lastRun };
  }

  // Guard on completed===true, not mere existence — an in-progress phase
  // (crashed mid-send-loop, remindedIds partially persisted) must be allowed
  // to resume, not be mistaken for done.
  if (cycle[phase]?.completed) {
    return NextResponse.json({ ok: true, skipped: "phase-completed" });
  }

  let entries: RentEntry[];
  try {
    const roster = await getState<{ entries: RentEntry[] }>("rent-roster");
    entries = roster?.entries ?? [];
  } catch (err) {
    console.error("rent-cycle cron: roster read failed; treating as an empty roster", err);
    entries = [];
  }
  const sendMode: SendMode = emailSendEnabled ? "live" : "disabled";
  const nowIso = new Date().toISOString();

  const scan = await scanPersistMatch(entries);
  if (!scan.scanOk) {
    cycle[phase] = { ranAt: nowIso, remindedIds: [], scanOk: false, error: scan.error, completed: true };
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

  // Carry forward any remindedIds already persisted by a crashed prior
  // attempt at this same phase — classifyRenter above already used them to
  // keep those renters out of the candidate buckets, so this just makes sure
  // we don't overwrite that record with a shorter list.
  const remindedIds: string[] = [...(cycle[phase]?.remindedIds ?? [])];
  const reminded: RentEntry[] = [];
  const failed: RentEntry[] = [];

  if (sendMode === "live") {
    for (const entry of fullCandidates) {
      try {
        await sendEmail({
          to: entry.email!,
          subject: "Rent reminder — The Green Room",
          text: reminderText(entry, reminderCopyPhase(entry, phase, cycle)),
        });
        remindedIds.push(entry.id);
        reminded.push(entry);
      } catch (err) {
        console.error(`rent-cycle cron: reminder send failed for renter ${entry.id}`, err);
        failed.push(entry);
        continue;
      }
      // Persist after EVERY successful send — a crash mid-loop must never
      // re-email someone who already got their reminder on re-invocation.
      // Kept OUTSIDE the send try/catch: a bookkeeping-write failure must not
      // report an email that went out as "couldn't send".
      try {
        cycle[phase] = { ranAt: nowIso, remindedIds, scanOk: true, completed: false };
        await saveCycle(cycle);
      } catch (err) {
        console.error(`rent-cycle cron: incremental save failed after sending to ${entry.id}`, err);
      }
    }
    for (const p of partialCandidates) {
      try {
        await sendEmail({
          to: p.entry.email!,
          subject: "Rent reminder — The Green Room",
          text: reminderText(p.entry, reminderCopyPhase(p.entry, phase, cycle)),
        });
        remindedIds.push(p.entry.id);
      } catch (err) {
        console.error(`rent-cycle cron: partial reminder send failed for renter ${p.entry.id}`, err);
        failed.push(p.entry);
        continue;
      }
      try {
        cycle[phase] = { ranAt: nowIso, remindedIds, scanOk: true, completed: false };
        await saveCycle(cycle);
      } catch (err) {
        console.error(`rent-cycle cron: incremental save failed after sending to ${p.entry.id}`, err);
      }
    }
  }

  // Final persist is best-effort too — the always-200 contract holds even if
  // storage dies after the sends (the emails already went out; losing the
  // completed flag only risks a benign no-op-heavy re-run, never a re-email
  // of anyone recorded in an earlier successful incremental save).
  cycle[phase] = { ranAt: nowIso, remindedIds, scanOk: true, completed: true };
  cycle.lastRun = {
    at: nowIso,
    phase,
    reminded: reminded.length,
    manuallyPaid: manuallyPaid.length,
    detectedPaid: detectedPaid.length,
    partial: partialCandidates.length,
    needsText: needsText.length,
    sendFailed: failed.length,
    scanOk: true,
    automationOn: true,
    sendMode,
  };
  try {
    await saveCycle(cycle);
  } catch (err) {
    console.error("rent-cycle cron: final save failed (sends already completed)", err);
  }

  if (sendMode === "live") {
    const summary = buildOwnerSummary({
      phase,
      at: nowIso,
      reminded,
      manuallyPaid,
      detectedPaid,
      partial: partialCandidates,
      needsText,
      failed,
    });
    await sendAlert(summary).catch(err => console.error("rent-cycle cron: owner summary alert failed", err));
  }

  return NextResponse.json({ ok: true, ...cycle.lastRun });
}
