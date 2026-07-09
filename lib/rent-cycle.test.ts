import { describe, it, expect } from "vitest";
import { phaseForToday, currentCycleId, classifyRenter, reminderCopyPhase, type RentCycle, type PhaseRecord } from "./rent-cycle";
import type { RentEntry, VenmoMatch } from "./rent-match";

function entry(overrides: Partial<RentEntry> = {}): RentEntry {
  return { id: "r_1", name: "Kharys Gomez", type: "chair", amount: 200, status: "unpaid", email: "k@example.com", ...overrides };
}

function phaseRecord(overrides: Partial<PhaseRecord> = {}): PhaseRecord {
  return { ranAt: "x", remindedIds: [], scanOk: true, completed: true, ...overrides };
}

function match(overrides: Partial<VenmoMatch> = {}): VenmoMatch {
  return {
    renterId: "r_1",
    renterName: "Kharys Gomez",
    type: "chair",
    rentAmount: 200,
    detected: 200,
    count: 1,
    payers: ["Kharys Gomez"],
    enough: true,
    alreadyPaid: false,
    ...overrides,
  };
}

function emptyCycle(cycleId = "2026-07-10"): RentCycle {
  return { cycleId };
}

describe("phaseForToday", () => {
  it("is 'friday' on a Friday in NY time", () => {
    // 2026-07-10 is a Friday.
    expect(phaseForToday(new Date("2026-07-10T14:00:00.000Z"))).toBe("friday");
  });

  it("is 'monday' on a Monday in NY time", () => {
    // 2026-07-13 is a Monday.
    expect(phaseForToday(new Date("2026-07-13T14:00:00.000Z"))).toBe("monday");
  });

  it("is null on any other day", () => {
    // 2026-07-08 is a Wednesday.
    expect(phaseForToday(new Date("2026-07-08T14:00:00.000Z"))).toBeNull();
  });

  it("uses NY local time, not UTC, near the day boundary", () => {
    // 2026-07-10 03:00 UTC is still 2026-07-09 23:00 EDT (Thursday) — must
    // NOT read as Friday just because the UTC calendar date says so.
    expect(phaseForToday(new Date("2026-07-10T03:00:00.000Z"))).toBeNull();
  });

  it("holds across the US spring-forward DST boundary (2026-03-08 -> 03-09)", () => {
    // 2026-03-09 is the Monday immediately after DST spring-forward.
    expect(phaseForToday(new Date("2026-03-09T15:00:00.000Z"))).toBe("monday");
  });

  it("holds across the US fall-back DST boundary (2026-11-01 -> 11-02)", () => {
    // 2026-11-02 is the Monday immediately after DST fall-back.
    expect(phaseForToday(new Date("2026-11-02T15:00:00.000Z"))).toBe("monday");
  });
});

describe("currentCycleId", () => {
  it("is today's NY date on a Friday", () => {
    expect(currentCycleId(new Date("2026-07-10T14:00:00.000Z"))).toBe("2026-07-10");
  });

  it("is the preceding Friday's NY date on a Monday", () => {
    expect(currentCycleId(new Date("2026-07-13T14:00:00.000Z"))).toBe("2026-07-10");
  });

  it("resolves the same cycleId for Friday and the following Monday across the spring-forward DST boundary", () => {
    // Friday 2026-03-06, Monday 2026-03-09 (DST changes overnight 03-08/03-09) — same cycle.
    const friday = currentCycleId(new Date("2026-03-06T14:00:00.000Z"));
    const monday = currentCycleId(new Date("2026-03-09T14:00:00.000Z"));
    expect(friday).toBe("2026-03-06");
    expect(monday).toBe("2026-03-06");
  });

  it("resolves the same cycleId for Friday and the following Monday across the fall-back DST boundary", () => {
    // Friday 2026-10-30, Monday 2026-11-02 (DST changes overnight 11-01/11-02) — same cycle.
    const friday = currentCycleId(new Date("2026-10-30T14:00:00.000Z"));
    const monday = currentCycleId(new Date("2026-11-02T14:00:00.000Z"));
    expect(friday).toBe("2026-10-30");
    expect(monday).toBe("2026-10-30");
  });
});

describe("classifyRenter — ordered skip matrix", () => {
  it("1. status paid wins even if nothing was detected via Venmo", () => {
    const e = entry({ status: "paid" });
    expect(classifyRenter(e, undefined, emptyCycle(), "friday")).toEqual({ action: "manuallyPaid" });
  });

  it("2. Venmo detected >= amount takes precedence over an unpaid status", () => {
    const e = entry({ status: "unpaid", amount: 200 });
    const m = match({ detected: 200 });
    expect(classifyRenter(e, m, emptyCycle(), "friday")).toEqual({ action: "detectedPaid" });
  });

  it("2b. detected exceeding amount still counts as detectedPaid", () => {
    const e = entry({ amount: 200 });
    const m = match({ detected: 250 });
    expect(classifyRenter(e, m, emptyCycle(), "friday")).toEqual({ action: "detectedPaid" });
  });

  it("3. already in this phase's remindedIds is skipped even though it would otherwise send", () => {
    const e = entry({ id: "r_9" });
    const cycle: RentCycle = { cycleId: "c", friday: phaseRecord({ remindedIds: ["r_9"], completed: false }) };
    expect(classifyRenter(e, undefined, cycle, "friday")).toEqual({ action: "skip" });
  });

  it("3b. remindedIds is scoped per phase — a Friday reminder doesn't skip the Monday follow-up", () => {
    const e = entry({ id: "r_9" });
    const cycle: RentCycle = { cycleId: "c", friday: phaseRecord({ remindedIds: ["r_9"] }) };
    expect(classifyRenter(e, undefined, cycle, "monday")).toEqual({ action: "send", partial: false });
  });

  it("4. no email on file routes to needsText, even with a partial Venmo match", () => {
    const e = entry({ email: undefined, amount: 200 });
    const m = match({ detected: 50 });
    expect(classifyRenter(e, m, emptyCycle(), "friday")).toEqual({ action: "needsText" });
  });

  it("4b. a whitespace-only email is treated the same as no email on file", () => {
    const e = entry({ email: "   ", amount: 200 });
    expect(classifyRenter(e, undefined, emptyCycle(), "friday")).toEqual({ action: "needsText" });
  });

  it("5. partial Venmo payment (0 < detected < amount) sends with partial: true", () => {
    const e = entry({ amount: 200 });
    const m = match({ detected: 50 });
    expect(classifyRenter(e, m, emptyCycle(), "friday")).toEqual({ action: "send", partial: true });
  });

  it("6. no Venmo match at all sends the full reminder", () => {
    const e = entry({ amount: 200 });
    expect(classifyRenter(e, undefined, emptyCycle(), "friday")).toEqual({ action: "send", partial: false });
  });
});

describe("reminderCopyPhase", () => {
  it("Friday always gets the Friday first-touch copy", () => {
    const e = entry();
    expect(reminderCopyPhase(e, "friday", emptyCycle())).toBe("friday");
  });

  it("Monday gets the Monday follow-up copy when the renter was reminded Friday", () => {
    const e = entry({ id: "r_9" });
    const cycle: RentCycle = { cycleId: "c", friday: phaseRecord({ remindedIds: ["r_9"] }) };
    expect(reminderCopyPhase(e, "monday", cycle)).toBe("monday");
  });

  it("Monday falls back to the Friday first-touch copy when Friday's scan failed (no remindedIds at all)", () => {
    const e = entry({ id: "r_9" });
    const cycle: RentCycle = { cycleId: "c", friday: phaseRecord({ scanOk: false, error: "boom" }) };
    expect(reminderCopyPhase(e, "monday", cycle)).toBe("friday");
  });

  it("Monday falls back to the Friday first-touch copy when the renter was added over the weekend (no Friday record at all)", () => {
    const e = entry({ id: "r_9" });
    expect(reminderCopyPhase(e, "monday", emptyCycle())).toBe("friday");
  });

  it("Monday falls back to the Friday first-touch copy when this specific renter's Friday send failed", () => {
    const e = entry({ id: "r_9" });
    const cycle: RentCycle = { cycleId: "c", friday: phaseRecord({ remindedIds: ["r_1", "r_2"] }) };
    expect(reminderCopyPhase(e, "monday", cycle)).toBe("friday");
  });
});
