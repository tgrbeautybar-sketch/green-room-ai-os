import { stylists } from "./stylists";
import { rng } from "./rng";

export type RentStatus = "paid" | "outstanding" | "late" | "partial";

export type RentRow = {
  stylistId: string;
  name: string;
  chair: string;
  amountDue: number;
  amountPaid: number;
  status: RentStatus;
  method: "Venmo" | "Zelle" | "Cash" | "ACH";
  paidAt: string | null; // ISO time
  remindersSent: number;
};

const METHODS: RentRow["method"][] = ["Venmo", "Zelle", "Cash", "ACH"];

function fridayHHMM(r: () => number): string {
  // Friday demo "now" is 4:42pm — payments arrive across the day.
  const hour = 8 + Math.floor(r() * 9); // 8am - 4pm
  const min = Math.floor(r() * 60);
  return `2026-05-29T${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`;
}

export const rentRoll: RentRow[] = stylists
  .filter(s => s.rentDue > 0)
  .map((s, i) => {
    const r = rng(s.id.charCodeAt(0) * 7919 + i * 23);
    const roll = r();
    let status: RentStatus;
    let amountPaid: number;
    let paidAt: string | null;
    let reminders = 0;
    if (roll < 0.58) { status = "paid";       amountPaid = s.rentDue; paidAt = fridayHHMM(r); }
    else if (roll < 0.74) { status = "partial"; amountPaid = Math.round(s.rentDue * 0.5); paidAt = fridayHHMM(r); reminders = 1; }
    else if (roll < 0.90) { status = "outstanding"; amountPaid = 0; paidAt = null; reminders = 1; }
    else                  { status = "late";       amountPaid = 0; paidAt = null; reminders = 2; }
    return {
      stylistId: s.id,
      name: s.name,
      chair: s.chair,
      amountDue: s.rentDue,
      amountPaid,
      status,
      method: METHODS[Math.floor(r() * METHODS.length)],
      paidAt,
      remindersSent: reminders,
    };
  });

export function rentSummary() {
  const total = rentRoll.reduce((a, r) => a + r.amountDue, 0);
  const collected = rentRoll.reduce((a, r) => a + r.amountPaid, 0);
  const paidCount = rentRoll.filter(r => r.status === "paid").length;
  const outstandingCount = rentRoll.filter(r => r.status !== "paid").length;
  return {
    total,
    collected,
    outstanding: total - collected,
    paidCount,
    outstandingCount,
    totalStylists: rentRoll.length,
    collectedPct: total === 0 ? 0 : collected / total,
  };
}

export function draftReminderText(row: RentRow): string {
  if (row.status === "partial") {
    return `Hi ${row.name.split(" ")[0]} — got your partial ($${row.amountPaid}) earlier, just need the remaining $${row.amountDue - row.amountPaid} for ${row.chair} when you get a sec. Thanks! — Belinda`;
  }
  if (row.status === "late") {
    return `Hey ${row.name.split(" ")[0]} — second nudge on this week's rent for ${row.chair} ($${row.amountDue}). Can you send today? Lmk if there's a hiccup. — Belinda`;
  }
  return `Hi ${row.name.split(" ")[0]} — friendly Friday reminder, $${row.amountDue} for ${row.chair} when you have a minute. Venmo or Zelle works. Thanks! — Belinda`;
}
