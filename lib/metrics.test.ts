import { describe, it, expect } from "vitest";
import { computeMetrics, computeRent, toDateOnly, MIN_IDENTIFIED_CUSTOMERS, type RentEntry, type RentPayment } from "./metrics";
import type { NormalizedTxn } from "./transactions";

function txn(overrides: Partial<NormalizedTxn> = {}): NormalizedTxn {
  return {
    id: `t_${Math.random().toString(36).slice(2)}`,
    externalId: "",
    source: "csv",
    date: "2026-07-01",
    gross: 100,
    tip: 0,
    itemName: "Root Touch-Up",
    category: "Service",
    purchaseType: "Service",
    customerId: null,
    serviceProviderId: null,
    appointmentId: null,
    importedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2026-07-09T12:00:00.000Z"); // window helper anchor

describe("computeMetrics", () => {
  it("handles an empty ledger without throwing", () => {
    const m = computeMetrics([], 7, { now: NOW });
    expect(m.gross).toBe(0);
    expect(m.avgTicket).toBe(0);
    expect(m.bookings).toBe(0);
    expect(m.topService).toBeNull();
    expect(m.repeatClientRate).toBeNull();
    expect(m.cogs).toBeNull();
    expect(m.net).toBeNull();
    expect(m.dailySeries).toHaveLength(7);
    expect(m.dailySeries.every(d => d.gross === 0)).toBe(true);
    expect(m.coverage.days).toBe(0);
  });

  it("sums gross across txns, netting refund negatives, but only counts positive-gross rows as bookings (F-4)", () => {
    const txns = [
      txn({ date: "2026-07-08", gross: 150 }),
      txn({ date: "2026-07-08", gross: -50 }), // refund — nets against gross, doesn't count as a booking
      txn({ date: "2026-07-09", gross: 80 }),
    ];
    const m = computeMetrics(txns, 7, { now: NOW });
    expect(m.gross).toBe(180);
    expect(m.bookings).toBe(2); // the refund row is excluded
    expect(m.avgTicket).toBe(90); // 180 / 2
  });

  it("excludes refunds and zero-value rows from the bookings count entirely", () => {
    const txns = [
      txn({ date: "2026-07-09", gross: -30 }), // pure refund, no offsetting sale in window
      txn({ date: "2026-07-09", gross: 0 }), // zero-value row
    ];
    const m = computeMetrics(txns, 7, { now: NOW });
    expect(m.bookings).toBe(0);
    expect(m.gross).toBe(-30);
    expect(m.avgTicket).toBe(0); // guarded against NaN when bookings is 0 (EC-2)
  });

  it("excludes txns outside the requested window", () => {
    const txns = [
      txn({ date: "2026-06-01", gross: 500 }), // way outside a 7-day window ending 2026-07-09
      txn({ date: "2026-07-09", gross: 40 }),
    ];
    const m = computeMetrics(txns, 7, { now: NOW });
    expect(m.gross).toBe(40);
    expect(m.bookings).toBe(1);
  });

  it("only computes cogs/net when cogsPct is provided", () => {
    const txns = [txn({ date: "2026-07-09", gross: 200 })];
    const withoutCogs = computeMetrics(txns, 7, { now: NOW });
    expect(withoutCogs.cogs).toBeNull();
    expect(withoutCogs.net).toBeNull();

    const withCogs = computeMetrics(txns, 7, { now: NOW, cogsPct: 20 });
    expect(withCogs.cogs).toBe(40);
    expect(withCogs.net).toBe(160);
  });

  it("picks the top service by gross share, and null when there are no sales", () => {
    const txns = [
      txn({ date: "2026-07-09", itemName: "Balayage", gross: 300 }),
      txn({ date: "2026-07-09", itemName: "Men's Cut", gross: 100 }),
    ];
    const m = computeMetrics(txns, 7, { now: NOW });
    expect(m.topService).toEqual({ name: "Balayage", share: 75 });

    const empty = computeMetrics([], 7, { now: NOW });
    expect(empty.topService).toBeNull();
  });

  it("clamps topService.share to 100 even when refunds elsewhere shrink total gross below the top item's revenue", () => {
    const txns = [
      txn({ date: "2026-07-09", itemName: "Balayage", gross: 300 }),
      txn({ date: "2026-07-09", itemName: "Refunded cut", gross: -250 }), // drags total gross down to 50
    ];
    const m = computeMetrics(txns, 7, { now: NOW });
    expect(m.gross).toBe(50);
    // Un-clamped this would be 600% (300 / 50) — must read as a real share.
    expect(m.topService?.share).toBe(100);
  });

  it("computes repeat client rate only among identified (non-null customerId) customers", () => {
    const txns = [
      // 4 identified customers, meets MIN_IDENTIFIED_CUSTOMERS — 2 of them are repeats
      txn({ date: "2026-07-01", customerId: "c1" }),
      txn({ date: "2026-07-05", customerId: "c1" }), // repeat
      txn({ date: "2026-07-02", customerId: "c2" }),
      txn({ date: "2026-07-06", customerId: "c2" }), // repeat
      txn({ date: "2026-07-03", customerId: "c3" }),
      txn({ date: "2026-07-04", customerId: "c4" }),
      // unknown customers — must not affect the denominator or numerator
      txn({ date: "2026-07-07", customerId: null }),
      txn({ date: "2026-07-07", customerId: null }),
    ];
    const m = computeMetrics(txns, 30, { now: NOW });
    expect(m.repeatClientRate).toBe(0.5); // 2 of 4 identified customers came back
  });

  it("returns null repeat rate when too few identified customers", () => {
    const txns = [txn({ date: "2026-07-09", customerId: "c1" })];
    const m = computeMetrics(txns, 30, { now: NOW });
    expect(txns.length).toBeLessThan(MIN_IDENTIFIED_CUSTOMERS);
    expect(m.repeatClientRate).toBeNull();
  });

  it("builds a fixed-length daily series covering the window, oldest first", () => {
    const txns = [
      txn({ date: "2026-07-07", gross: 20 }),
      txn({ date: "2026-07-09", gross: 30 }),
    ];
    const m = computeMetrics(txns, 3, { now: NOW }); // window = 2026-07-07..2026-07-09
    expect(m.dailySeries).toEqual([
      { date: "2026-07-07", gross: 20 },
      { date: "2026-07-08", gross: 0 },
      { date: "2026-07-09", gross: 30 },
    ]);
  });

  it("reports coverage based on the earliest data actually present", () => {
    const txns = [txn({ date: "2026-07-08", gross: 10 }), txn({ date: "2026-07-09", gross: 10 })];
    const m = computeMetrics(txns, 30, { now: NOW }); // asked for 30 days, only 2 days of data exist
    expect(m.coverage.from).toBe("2026-07-08");
    expect(m.coverage.to).toBe("2026-07-09");
    expect(m.coverage.days).toBe(2);
  });

  it("derives 'today' from the salon's local calendar date (America/New_York), not UTC (EC-1)", () => {
    // 2026-07-10T02:00:00Z is 10pm on July 9 in New York (EDT, UTC-4) — the
    // old UTC-based toISOString() derivation would already treat this as
    // July 10, silently excluding a same-evening sale from a 1-day window.
    const lateEveningUtc = new Date("2026-07-10T02:00:00.000Z");
    const txns = [txn({ date: "2026-07-09", gross: 40 })];
    const m = computeMetrics(txns, 1, { now: lateEveningUtc });
    expect(m.coverage.to).toBe("2026-07-09");
    expect(m.gross).toBe(40);
  });
});

describe("toDateOnly (salon-local calendar date, EC-1)", () => {
  it("uses America/New_York rather than UTC across the UTC day boundary", () => {
    expect(toDateOnly(new Date("2026-07-10T02:00:00.000Z"))).toBe("2026-07-09"); // 10pm ET Jul 9
    expect(toDateOnly(new Date("2026-07-09T12:00:00.000Z"))).toBe("2026-07-09"); // 8am ET Jul 9
    expect(toDateOnly(new Date("2026-01-01T04:30:00.000Z"))).toBe("2025-12-31"); // 11:30pm ET Dec 31 (EST, UTC-5)
  });
});

describe("computeRent", () => {
  const roster: RentEntry[] = [
    { id: "r1", name: "Ana Suarez", type: "chair", amount: 200, status: "paid" },
    { id: "r2", name: "Ben Ortiz", type: "chair", amount: 200, status: "unpaid", venmoName: "B-Ortiz22" },
    { id: "r3", name: "Cara Diaz", type: "room", amount: 250, status: "unpaid" },
  ];

  it("counts a manually-marked-paid renter as collected", () => {
    const rent = computeRent([roster[0]], [], 9, { now: NOW });
    expect(rent.expected).toBe(200);
    expect(rent.collected).toBe(200);
    expect(rent.outstanding).toBe(0);
    expect(rent.paidCount).toBe(1);
    expect(rent.renterCount).toBe(1);
  });

  it("matches an unpaid renter via exact venmoName, within the period window", () => {
    const payments: RentPayment[] = [{ payer: "B-Ortiz22", amount: 200, date: "2026-07-08" }];
    const rent = computeRent([roster[1]], payments, 9, { now: NOW });
    expect(rent.collected).toBe(200);
    expect(rent.paidCount).toBe(1);
  });

  it("falls back to fuzzy first+last name token match when there's no venmoName on file", () => {
    const payments: RentPayment[] = [{ payer: "cara diaz", amount: 250, date: "2026-07-07" }];
    const rent = computeRent([roster[2]], payments, 9, { now: NOW });
    expect(rent.collected).toBe(250);
    expect(rent.paidCount).toBe(1);
  });

  it("ignores payments outside the rent period window", () => {
    const payments: RentPayment[] = [{ payer: "cara diaz", amount: 250, date: "2026-06-01" }]; // way outside 9 days
    const rent = computeRent([roster[2]], payments, 9, { now: NOW });
    expect(rent.collected).toBe(0);
    expect(rent.outstanding).toBe(250);
  });

  it("sums the whole roster for expected/outstanding/renterCount", () => {
    const payments: RentPayment[] = [{ payer: "B-Ortiz22", amount: 200, date: "2026-07-08" }];
    const rent = computeRent(roster, payments, 9, { now: NOW });
    expect(rent.renterCount).toBe(3);
    expect(rent.expected).toBe(650);
    expect(rent.collected).toBe(400); // Ana (paid) + Ben (matched)
    expect(rent.outstanding).toBe(250); // Cara unmatched
    expect(rent.paidCount).toBe(2);
  });

  it("handles an empty roster", () => {
    const rent = computeRent([], [], 9, { now: NOW });
    expect(rent).toEqual({ collected: 0, outstanding: 0, expected: 0, paidCount: 0, renterCount: 0 });
  });
});
