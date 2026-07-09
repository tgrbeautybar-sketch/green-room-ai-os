import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// In-memory stand-in for lib/store.ts's Supabase/fs-backed persistence, plus
// controllable read/write failure injection for the E2 storage-outage cases.
// vi.mock() factories are hoisted above imports, so the mutable state has to
// be created via vi.hoisted() (mirrors the pattern in lib/transactions.test.ts).
const { state } = vi.hoisted(() => ({
  state: {
    store: new Map<string, unknown>(),
    failReadKeys: new Set<string>(),
    failWriteKeys: new Set<string>(),
  },
}));

vi.mock("@/lib/store", () => ({
  getState: vi.fn(async (key: string) => {
    if (state.failReadKeys.has(key)) throw new Error(`simulated read failure: ${key}`);
    return state.store.has(key) ? state.store.get(key) : null;
  }),
  setState: vi.fn(async (key: string, value: unknown) => {
    if (state.failWriteKeys.has(key)) throw new Error(`simulated write failure: ${key}`);
    state.store.set(key, value);
  }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ mode: "live" as const })),
  sendAlert: vi.fn(async () => ({ mode: "live" as const })),
  emailSendEnabled: true,
}));

// lib/rent-match.ts's scanPersistMatch calls this to read Belinda's inbox —
// mocked so tests never touch a real IMAP connection. Defaults to "no Venmo
// activity found this run."
vi.mock("@/lib/venmo", () => ({
  scanVenmoPayments: vi.fn(async () => []),
}));

import { GET } from "./route";
import { getState, setState } from "@/lib/store";
import { sendEmail, sendAlert } from "@/lib/email";
import { scanVenmoPayments } from "@/lib/venmo";
import type { RentEntry } from "@/lib/rent-match";
import type { RentCycle } from "@/lib/rent-cycle";

const getStateMock = vi.mocked(getState);
const setStateMock = vi.mocked(setState);
const sendEmailMock = vi.mocked(sendEmail);
const sendAlertMock = vi.mocked(sendAlert);
const scanVenmoMock = vi.mocked(scanVenmoPayments);

const CRON_SECRET = "test-secret";
const FRIDAY = new Date("2026-07-10T14:00:00.000Z"); // matches lib/rent-cycle.test.ts's fixture Friday
const MONDAY = new Date("2026-07-13T14:00:00.000Z"); // matches lib/rent-cycle.test.ts's fixture Monday

function renter(overrides: Partial<RentEntry> = {}): RentEntry {
  return { id: "r_1", name: "Renter One", type: "chair", amount: 200, status: "unpaid", email: "r1@example.com", ...overrides };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/cron/rent-cycle", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

beforeEach(() => {
  state.store.clear();
  state.failReadKeys.clear();
  state.failWriteKeys.clear();
  getStateMock.mockClear();
  setStateMock.mockClear();
  sendEmailMock.mockReset().mockResolvedValue({ mode: "live" });
  sendAlertMock.mockReset().mockResolvedValue({ mode: "live" });
  scanVenmoMock.mockReset().mockResolvedValue([]);
  process.env.CRON_SECRET = CRON_SECRET;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FRIDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("F1 — send failures are never reported as a quiet success", () => {
  it("when every send fails, lastRun.sendFailed reflects it and the owner summary names them", async () => {
    state.store.set("rent-automation", { autoRemind: true });
    state.store.set("rent-roster", {
      entries: [
        renter({ id: "r1", name: "Alice A", email: "alice@example.com" }),
        renter({ id: "r2", name: "Bob B", email: "bob@example.com" }),
      ],
    });
    sendEmailMock.mockRejectedValue(new Error("invalid_grant: lapsed Gmail credentials"));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reminded).toBe(0);
    expect(body.sendFailed).toBe(2);

    const cycle = state.store.get("rent-cycle") as RentCycle;
    expect(cycle.friday?.completed).toBe(true);
    expect(cycle.friday?.remindedIds).toEqual([]);

    expect(sendAlertMock).toHaveBeenCalledTimes(1);
    const summaryText = sendAlertMock.mock.calls[0][0].text;
    expect(summaryText).toContain("Couldn't send (2):");
    expect(summaryText).toContain("Alice A");
    expect(summaryText).toContain("Bob B");
  });
});

describe("F2 — a crashed mid-loop run resumes without re-emailing", () => {
  it("only unreminded renters are sent on resume, and the phase completes", async () => {
    state.store.set("rent-automation", { autoRemind: true });
    state.store.set("rent-roster", {
      entries: [
        renter({ id: "r1", name: "Already Reminded", email: "r1@example.com" }),
        renter({ id: "r2", name: "Not Yet Reminded", email: "r2@example.com" }),
      ],
    });
    // Simulates a crash after r1's send succeeded and was persisted
    // incrementally, but before the run reached completion.
    state.store.set("rent-cycle", {
      cycleId: "2026-07-10",
      friday: { ranAt: "2026-07-10T13:00:00.000Z", remindedIds: ["r1"], scanOk: true, completed: false },
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "r2@example.com" }));
    expect(body.reminded).toBe(1);

    const cycle = state.store.get("rent-cycle") as RentCycle;
    expect(cycle.friday?.completed).toBe(true);
    expect([...(cycle.friday?.remindedIds ?? [])].sort()).toEqual(["r1", "r2"]);

    // Persisted incrementally (at least once mid-loop, plus the final save)
    // rather than only once at the very end.
    const rentCycleSaves = setStateMock.mock.calls.filter(c => c[0] === "rent-cycle");
    expect(rentCycleSaves.length).toBeGreaterThanOrEqual(2);
  });
});

describe("U1 — Monday sends first-touch copy to renters Friday never reached", () => {
  it("uses the Monday follow-up for someone reminded Friday, and the Friday first-touch copy for someone who wasn't", async () => {
    vi.setSystemTime(MONDAY);
    state.store.set("rent-automation", { autoRemind: true });
    state.store.set("rent-roster", {
      entries: [
        renter({ id: "r1", name: "Got Friday Email", email: "r1@example.com" }),
        renter({ id: "r2", name: "Added Over The Weekend", email: "r2@example.com" }),
      ],
    });
    state.store.set("rent-cycle", {
      cycleId: "2026-07-10",
      friday: { ranAt: "2026-07-10T13:00:00.000Z", remindedIds: ["r1"], scanOk: true, completed: true },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const toR1 = sendEmailMock.mock.calls.find(c => c[0].to === "r1@example.com");
    const toR2 = sendEmailMock.mock.calls.find(c => c[0].to === "r2@example.com");
    expect(toR1?.[0].text).toContain("just circling back");
    expect(toR2?.[0].text).toContain("Friendly reminder");
  });
});

describe("E2 — storage read failures degrade instead of 500ing", () => {
  it("an automation-toggle read failure is treated as OFF (inert)", async () => {
    state.failReadKeys.add("rent-automation");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toBe("off");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a cycle-read failure falls back to a fresh cycle and still sends, as long as storage is writable", async () => {
    state.store.set("rent-automation", { autoRemind: true });
    state.store.set("rent-roster", { entries: [renter({ id: "r1", email: "r1@example.com" })] });
    state.failReadKeys.add("rent-cycle");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reminded).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("a total storage outage (read AND write both failing) aborts before sending a single email", async () => {
    state.store.set("rent-automation", { autoRemind: true });
    state.store.set("rent-roster", { entries: [renter({ id: "r1", email: "r1@example.com" })] });
    state.failReadKeys.add("rent-cycle");
    state.failWriteKeys.add("rent-cycle");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.storageOk).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendAlertMock).toHaveBeenCalledTimes(1);
    expect(sendAlertMock.mock.calls[0][0].subject).toContain("storage unavailable");
    expect(sendAlertMock.mock.calls[0][0].text).toContain("Couldn't reach storage");
  });

  it("a roster-read failure is treated as an empty roster — no emails, no crash", async () => {
    state.store.set("rent-automation", { autoRemind: true });
    state.failReadKeys.add("rent-roster");

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reminded).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("EC1 — whitespace-only email is treated as no email on file", () => {
  it("routes a whitespace-only email to needsText instead of attempting (and failing) a send", async () => {
    state.store.set("rent-automation", { autoRemind: true });
    state.store.set("rent-roster", {
      entries: [renter({ id: "r1", name: "Blank Email Renter", email: "   " })],
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsText).toBe(1);
    expect(body.reminded).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("I1 — Vercel Cron auth", () => {
  it("rejects an unauthenticated request with 401 before touching any state", async () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    try {
      const res = await GET(new NextRequest("http://localhost/api/cron/rent-cycle"));
      expect(res.status).toBe(401);
      expect(getStateMock).not.toHaveBeenCalled();
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });
});
