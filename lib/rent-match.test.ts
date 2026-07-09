import { describe, it, expect } from "vitest";
import { computeMatches, type RentEntry } from "./rent-match";
import type { VenmoPayment } from "./venmo";

function entry(overrides: Partial<RentEntry> = {}): RentEntry {
  return {
    id: `r_${Math.random().toString(36).slice(2)}`,
    name: "Carolyn Keizl",
    type: "chair",
    amount: 200,
    status: "unpaid",
    ...overrides,
  };
}

function payment(overrides: Partial<VenmoPayment> = {}): VenmoPayment {
  return { payer: "Carolyn Keizl", amount: 200, date: "2026-07-08T12:00:00.000Z", subject: "", ...overrides };
}

// Regression guard: this ports the exact matching semantics that used to
// live inline in app/api/rent/check-payments/route.ts. Any change here that
// breaks one of these cases would have silently mismatched real rent
// payments in production.
describe("computeMatches", () => {
  it("matches on exact venmoName when the renter has one on file (case/whitespace insensitive)", () => {
    const e = entry({ name: "Caro K.", venmoName: "Carolyn K" });
    const ps = [payment({ payer: "  CAROLYN k  " })];
    const { matches } = computeMatches([e], ps);
    expect(matches).toHaveLength(1);
    expect(matches[0].detected).toBe(200);
  });

  it("does NOT fall back to name-token matching when venmoName is set but doesn't match", () => {
    const e = entry({ name: "Carolyn Keizl", venmoName: "CK Venmo" });
    const ps = [payment({ payer: "Carolyn Keizl" })]; // matches roster name, not venmoName
    const { matches, unmatched } = computeMatches([e], ps);
    expect(matches).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it("falls back to first-name token equality when venmoName is unset", () => {
    const e = entry({ name: "Kharys Gomez" });
    const ps = [payment({ payer: "Kharys" })]; // first name only, no last name on either side to confirm
    const { matches } = computeMatches([e], ps);
    expect(matches).toHaveLength(1);
  });

  it("requires last-name confirmation when both payer and roster name have multiple tokens", () => {
    const e = entry({ name: "Kharys Gomez" });
    const ps = [payment({ payer: "Kharys Rivera" })]; // same first name, different last name
    const { matches, unmatched } = computeMatches([e], ps);
    expect(matches).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it("treats a whitespace-only venmoName as unset and falls back to name matching", () => {
    const e = entry({ name: "Kharys Gomez", venmoName: "   " });
    const ps = [payment({ payer: "Kharys Gomez" })];
    const { matches } = computeMatches([e], ps);
    expect(matches).toHaveLength(1);
    expect(matches[0].detected).toBe(200);
  });

  it("sums split payments from the same matched payer toward one renter", () => {
    const e = entry({ amount: 200 });
    const ps = [payment({ amount: 120 }), payment({ amount: 80, date: "2026-07-09T12:00:00.000Z" })];
    const { matches } = computeMatches([e], ps);
    expect(matches).toHaveLength(1);
    expect(matches[0].detected).toBe(200);
    expect(matches[0].count).toBe(2);
    expect(matches[0].enough).toBe(true);
  });

  it("flags enough=false when the summed total falls short of rent", () => {
    const e = entry({ amount: 200 });
    const ps = [payment({ amount: 120 })];
    const { matches } = computeMatches([e], ps);
    expect(matches[0].detected).toBe(120);
    expect(matches[0].enough).toBe(false);
  });

  it("puts payments with no matching renter into unmatched", () => {
    const e = entry({ name: "Carolyn Keizl" });
    const ps = [payment({ payer: "A Stranger", amount: 50 })];
    const { matches, unmatched } = computeMatches([e], ps);
    expect(matches).toHaveLength(0);
    expect(unmatched).toEqual([{ payer: "A Stranger", amount: 50, date: ps[0].date }]);
  });

  it("excludes entries with zero matching payments from `matches` entirely", () => {
    const e = entry({ name: "Nobody Home" });
    const { matches } = computeMatches([e], []);
    expect(matches).toHaveLength(0);
  });

  it("carries alreadyPaid from the roster's own status field", () => {
    const e = entry({ status: "paid" });
    const ps = [payment()];
    const { matches } = computeMatches([e], ps);
    expect(matches[0].alreadyPaid).toBe(true);
  });

  it("de-dupes payers list per renter while keeping the summed total", () => {
    const e = entry();
    const ps = [payment({ amount: 100 }), payment({ amount: 100, date: "2026-07-09T12:00:00.000Z" })];
    const { matches } = computeMatches([e], ps);
    expect(matches[0].payers).toEqual(["Carolyn Keizl"]);
    expect(matches[0].detected).toBe(200);
  });
});
