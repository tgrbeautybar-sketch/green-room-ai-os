import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for lib/store.ts's Supabase/fs-backed persistence.
// vi.mock() factories are hoisted above imports, so the mutable state has to
// be created via vi.hoisted() (mirrors app/api/cron/rent-cycle/route.test.ts).
const { state } = vi.hoisted(() => ({
  state: { store: new Map<string, unknown>() },
}));

vi.mock("@/lib/store", () => ({
  getState: vi.fn(async (key: string) => (state.store.has(key) ? state.store.get(key) : null)),
  setState: vi.fn(async (key: string, value: unknown) => {
    state.store.set(key, value);
  }),
}));

import { POST } from "./route";
import { setState } from "@/lib/store";
import type { RentEntry } from "@/lib/rent-match";

const setStateMock = vi.mocked(setState);

function renter(overrides: Partial<RentEntry> = {}): RentEntry {
  return { id: "r_1", name: "Renter One", type: "chair", amount: 200, status: "unpaid", ...overrides };
}

beforeEach(() => {
  state.store.clear();
  setStateMock.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-17T15:00:00.000Z"));
});

describe("POST /api/rent/new-week", () => {
  it("flips every renter to unpaid while preserving all other fields", async () => {
    state.store.set("rent-roster", {
      entries: [
        renter({ id: "r1", name: "Alice A", amount: 200, status: "paid", email: "alice@example.com", phone: "555", venmoName: "AliceA", note: "back room", type: "room" }),
        renter({ id: "r2", name: "Bob B", amount: 175, status: "unpaid" }),
      ],
    });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.entries).toHaveLength(2);
    expect(body.entries.every((e: RentEntry) => e.status === "unpaid")).toBe(true);

    // Every non-status field on the first renter survives verbatim.
    const alice = body.entries.find((e: RentEntry) => e.id === "r1");
    expect(alice).toMatchObject({
      id: "r1", name: "Alice A", amount: 200, email: "alice@example.com",
      phone: "555", venmoName: "AliceA", note: "back room", type: "room", status: "unpaid",
    });

    // Persisted roster matches the returned entries.
    expect(state.store.get("rent-roster")).toEqual({ entries: body.entries });
  });

  it("stamps the rent-week marker with the current time", async () => {
    state.store.set("rent-roster", { entries: [renter()] });

    const res = await POST();
    const body = await res.json();

    const expectedIso = "2026-07-17T15:00:00.000Z";
    expect(body.weekStartedAt).toBe(expectedIso);
    expect(state.store.get("rent-week")).toEqual({ startedAt: expectedIso });
  });

  it("still stamps the marker for an empty roster (no-op reset)", async () => {
    state.store.set("rent-roster", { entries: [] });

    const res = await POST();
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.entries).toEqual([]);
    expect(state.store.get("rent-week")).toEqual({ startedAt: "2026-07-17T15:00:00.000Z" });
  });

  it("re-stamps even when everyone is already unpaid", async () => {
    state.store.set("rent-roster", { entries: [renter({ status: "unpaid" })] });

    const res = await POST();
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.entries[0].status).toBe("unpaid");
    expect(state.store.get("rent-week")).toEqual({ startedAt: "2026-07-17T15:00:00.000Z" });
  });

  it("treats a missing roster as empty and still stamps the marker", async () => {
    // No rent-roster key set at all.
    const res = await POST();
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.entries).toEqual([]);
    expect(state.store.get("rent-week")).toEqual({ startedAt: "2026-07-17T15:00:00.000Z" });
  });

  it("never touches the venmo-payments store", async () => {
    state.store.set("rent-roster", { entries: [renter({ status: "paid" })] });
    state.store.set("venmo-payments", { payments: [{ payer: "X", amount: 200, date: "2026-07-15" }] });

    await POST();

    // Only rent-roster and rent-week are written — not venmo-payments,
    // rent-automation, or rent-cycle.
    const writtenKeys = setStateMock.mock.calls.map(c => c[0]);
    expect(writtenKeys).toContain("rent-roster");
    expect(writtenKeys).toContain("rent-week");
    expect(writtenKeys).not.toContain("venmo-payments");
    expect(writtenKeys).not.toContain("rent-automation");
    expect(writtenKeys).not.toContain("rent-cycle");
    // Store untouched.
    expect(state.store.get("venmo-payments")).toEqual({ payments: [{ payer: "X", amount: 200, date: "2026-07-15" }] });
  });

  it("returns ok:false with an error when the roster write fails", async () => {
    state.store.set("rent-roster", { entries: [renter()] });
    setStateMock.mockRejectedValueOnce(new Error("simulated write failure"));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("simulated write failure");
  });

  it("returns ok:true and keeps the roster reset when only the marker write fails", async () => {
    state.store.set("rent-roster", { entries: [renter({ status: "paid" })] });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // First setState (rent-roster) writes normally; force the SECOND setState
    // (rent-week marker) to reject. The reset must still report success.
    setStateMock
      .mockImplementationOnce(async (key: string, value: unknown) => { state.store.set(key, value); })
      .mockRejectedValueOnce(new Error("marker write failed"));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.entries[0].status).toBe("unpaid");
    // Roster was reset and persisted despite the marker failure.
    expect(state.store.get("rent-roster")).toEqual({ entries: body.entries });
    // Marker never landed, but the response still carries the intended stamp.
    expect(state.store.get("rent-week")).toBeUndefined();
    expect(body.weekStartedAt).toBe("2026-07-17T15:00:00.000Z");
    // Failure was logged server-side rather than surfaced to the UI.
    expect(errSpy).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
