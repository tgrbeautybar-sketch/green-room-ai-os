import { getState, setState } from "./store";
import type { RentEntry, VenmoMatch } from "./rent-match";

// Rent auto-remind scheduling: which phase (Friday morning reminder / Monday
// morning follow-up) runs today, which weekly cycle we're in, and the
// per-renter skip/send decision for that phase. Kept together here because
// the cycle shape and the classification logic are tightly coupled — see
// rent-cycle.test.ts for the full matrix + DST-boundary coverage.

const SALON_TIMEZONE = "America/New_York";

export type CyclePhase = "friday" | "monday";
export type SendMode = "live" | "disabled";

export type PhaseRecord = {
  ranAt: string;
  remindedIds: string[];
  scanOk: boolean;
  error?: string;
};

export type LastRun = {
  at: string;
  phase: CyclePhase;
  reminded: number;
  manuallyPaid: number;
  detectedPaid: number;
  partial: number;
  needsText: number;
  scanOk: boolean;
  error?: string;
  automationOn: boolean;
  sendMode: SendMode;
};

export type RentCycle = {
  cycleId: string;
  friday?: PhaseRecord;
  monday?: PhaseRecord;
  lastRun?: LastRun;
};

// Testability hook — every date-deriving helper below accepts an optional
// `now`, defaulting to the real current time, so tests (and manual smoke
// testing of the cron route) can simulate "it's Friday morning" without
// mocking the global Date constructor.
export function salonNow(now?: Date): Date {
  return now ?? new Date();
}

function nyDateOnly(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SALON_TIMEZONE }).format(d); // en-CA -> yyyy-mm-dd
}

function nyWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: SALON_TIMEZONE, weekday: "long" }).format(d);
}

// Calendar-date-only arithmetic (mirrors lib/metrics.ts's addDaysToDateStr) —
// shifts a yyyy-mm-dd string by whole days via UTC midnight math. This is
// DST-safe specifically because it never models a real elapsed duration
// across a wall-clock DST transition; it only ever moves between calendar
// dates, which have no DST concept of their own.
function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// "friday" or "monday" if today (in NY time) is one of those days, else null
// — the cron is a no-op on every other day.
export function phaseForToday(now?: Date): CyclePhase | null {
  const weekday = nyWeekday(salonNow(now));
  if (weekday === "Friday") return "friday";
  if (weekday === "Monday") return "monday";
  return null;
}

// One rent cycle = a Friday reminder plus its Monday follow-up, keyed by the
// Friday's NY date. On Friday that's today; on Monday it's the Friday 3
// calendar days prior (the same week's reminder run). Only meaningful when
// phaseForToday() is non-null, but defined for any day for defensiveness.
export function currentCycleId(now?: Date): string {
  const n = salonNow(now);
  const today = nyDateOnly(n);
  const weekday = nyWeekday(n);
  if (weekday === "Monday") return addDaysToDateStr(today, -3);
  return today;
}

export async function getCycle(): Promise<RentCycle | null> {
  return getState<RentCycle>("rent-cycle");
}

export async function saveCycle(cycle: RentCycle): Promise<void> {
  await setState("rent-cycle", cycle);
}

export type ClassificationOutcome =
  | { action: "manuallyPaid" }
  | { action: "detectedPaid" }
  | { action: "skip" }
  | { action: "needsText" }
  | { action: "send"; partial: boolean };

// The ordered skip matrix — evaluated top to bottom, first match wins:
//   1. marked paid by hand               -> manuallyPaid (no email)
//   2. Venmo detected >= full rent       -> detectedPaid (no email)
//   3. already reminded this phase       -> skip (defensive re-run guard —
//      the cron's phase-completed check normally prevents this from ever
//      being reached, but classifyRenter stays correct even if it is)
//   4. no email on file                  -> needsText (Belinda texts manually)
//   5. partial Venmo payment (0<d<amt)   -> send, partial
//   6. nothing detected                  -> send, full-amount reminder
export function classifyRenter(
  entry: RentEntry,
  match: VenmoMatch | undefined,
  cycle: RentCycle,
  phase: CyclePhase
): ClassificationOutcome {
  if (entry.status === "paid") return { action: "manuallyPaid" };

  const detected = match?.detected ?? 0;
  if (detected >= entry.amount) return { action: "detectedPaid" };

  const remindedIds = cycle[phase]?.remindedIds ?? [];
  if (remindedIds.includes(entry.id)) return { action: "skip" };

  if (!entry.email) return { action: "needsText" };

  if (detected > 0) return { action: "send", partial: true };

  return { action: "send", partial: false };
}
