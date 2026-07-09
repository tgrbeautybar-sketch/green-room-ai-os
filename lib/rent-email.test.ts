import { describe, it, expect } from "vitest";
import { reminderText, buildOwnerSummary } from "./rent-email";
import type { RentEntry } from "./rent-match";

function entry(overrides: Partial<RentEntry> = {}): RentEntry {
  return { id: "r_1", name: "Kharys Gomez", type: "chair", amount: 200, status: "unpaid", ...overrides };
}

describe("reminderText", () => {
  it("Friday copy matches the original send-email tone exactly", () => {
    const text = reminderText({ name: "Kharys Gomez", type: "chair", amount: 200 }, "friday");
    expect(text).toBe("Hi Kharys! Friendly reminder that your chair rent of $200 is due. Thank you so much! — Belinda");
  });

  it("Monday copy is a distinct softer follow-up", () => {
    const text = reminderText({ name: "Kharys Gomez", type: "chair", amount: 200 }, "monday");
    expect(text).toBe(
      "Hi Kharys, just circling back — your chair rent of $200 is still outstanding. Let me know if you've already sent it! Thanks so much. — Belinda"
    );
  });

  it("falls back to 'there' when name is empty", () => {
    const text = reminderText({ name: "", type: "room", amount: 250 }, "friday");
    expect(text).toContain("Hi there!");
  });

  it("uses only the first name from a full name", () => {
    const text = reminderText({ name: "Belinda Owner Smith", type: "room", amount: 250 }, "monday");
    expect(text.startsWith("Hi Belinda,")).toBe(true);
  });
});

describe("buildOwnerSummary", () => {
  it("labels the phase correctly and includes every section", () => {
    const { subject, text } = buildOwnerSummary({
      phase: "friday",
      at: "2026-07-10T13:02:00.000Z",
      reminded: [entry({ name: "Reminded Renter" })],
      manuallyPaid: [entry({ name: "Marked Paid" })],
      detectedPaid: [{ entry: entry({ name: "Venmo Paid" }), detected: 200 }],
      partial: [{ entry: entry({ name: "Partial Payer", amount: 200 }), detected: 75 }],
      needsText: [entry({ name: "No Email", phone: "555-1234" })],
      failed: [],
    });

    expect(subject).toContain("Friday reminder");
    expect(text).toContain("Reminded:");
    expect(text).toContain("Reminded Renter");
    expect(text).toContain("Marked Paid — marked paid");
    expect(text).toContain("Venmo Paid — $200 detected via Venmo");
    expect(text).toContain("Partial Payer — $75 of $200");
    expect(text).toContain("No Email — 555-1234");
    expect(text).toContain("Couldn't send: none.");
    expect(text).toContain("Totals: 1 reminded, 2 already paid, 1 partial, 1 needs a text.");
  });

  it("labels a Monday run distinctly and reports empty sections plainly", () => {
    const { subject, text } = buildOwnerSummary({
      phase: "monday",
      at: "2026-07-13T13:00:00.000Z",
      reminded: [],
      manuallyPaid: [],
      detectedPaid: [],
      partial: [],
      needsText: [],
      failed: [],
    });

    expect(subject).toContain("Monday follow-up");
    expect(text).toContain("Reminded: none.");
    expect(text).toContain("Already paid: none.");
    expect(text).toContain("Paid partially: none.");
    expect(text).toContain("Needs a manual text: none.");
    expect(text).toContain("Couldn't send: none.");
    expect(text).toContain("Totals: 0 reminded, 0 already paid, 0 partial, 0 needs a text.");
  });

  it("falls back to the raw phone-missing note when a needsText renter has neither phone nor email", () => {
    const { text } = buildOwnerSummary({
      phase: "friday",
      at: "2026-07-10T13:00:00.000Z",
      reminded: [],
      manuallyPaid: [],
      detectedPaid: [],
      partial: [],
      needsText: [entry({ name: "Truly Unreachable", phone: undefined })],
      failed: [],
    });
    expect(text).toContain("Truly Unreachable — no phone on file either");
  });

  it("names everyone a send failed for, even when every other section is empty — a run where all sends fail must never read like a quiet success", () => {
    const { text } = buildOwnerSummary({
      phase: "friday",
      at: "2026-07-10T13:00:00.000Z",
      reminded: [],
      manuallyPaid: [],
      detectedPaid: [],
      partial: [],
      needsText: [],
      failed: [entry({ name: "Lapsed Creds Renter" })],
    });
    expect(text).toContain("Couldn't send (1):");
    expect(text).toContain("Lapsed Creds Renter");
  });
});
