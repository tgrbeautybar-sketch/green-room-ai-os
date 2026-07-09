import type { RentEntry } from "./rent-match";
import type { CyclePhase } from "./rent-cycle";

// Reminder copy + the owner-facing run summary for the Friday/Monday
// auto-remind cron (app/api/cron/rent-cycle/route.ts) and the existing
// one-off "Email reminder" button (app/api/rent/send-email/route.ts).

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export type ReminderEntry = { name: string; type: string; amount: number };

// Friday: the same first-reminder tone the "Email reminder" button has
// always sent (unchanged — see app/api/rent/send-email/route.ts). Monday: a
// softer follow-up nudge, since she's already been reminded once this week.
export function reminderText(entry: ReminderEntry, phase: CyclePhase): string {
  const first = (entry.name ?? "").split(" ")[0] || "there";
  const amount = fmtUSD(entry.amount);
  if (phase === "monday") {
    return `Hi ${first}, just circling back — your ${entry.type} rent of ${amount} is still outstanding. Let me know if you've already sent it! Thanks so much. — Belinda`;
  }
  return `Hi ${first}! Friendly reminder that your ${entry.type} rent of ${amount} is due. Thank you so much! — Belinda`;
}

export type OwnerSummaryInput = {
  phase: CyclePhase;
  at: string; // ISO timestamp of this run
  reminded: RentEntry[];
  manuallyPaid: RentEntry[];
  detectedPaid: { entry: RentEntry; detected: number }[];
  partial: { entry: RentEntry; detected: number }[];
  needsText: RentEntry[];
  failed: RentEntry[];
};

function formatRunTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

// Belinda's morning summary email — one glance at who got reminded, who's
// already covered (split by how we know — she marked it vs. Venmo detected
// it), who's short, and who needs a manual text because there's no email on
// file for them.
export function buildOwnerSummary(input: OwnerSummaryInput): { subject: string; text: string } {
  const phaseLabel = input.phase === "monday" ? "Monday follow-up" : "Friday reminder";
  const lines: string[] = [];

  lines.push(`Rent auto-remind — ${phaseLabel} ran.`, "");

  lines.push(input.reminded.length > 0 ? "Reminded:" : "Reminded: none.");
  for (const e of input.reminded) lines.push(`  • ${e.name} — ${fmtUSD(e.amount)}`);
  lines.push("");

  const alreadyPaidCount = input.manuallyPaid.length + input.detectedPaid.length;
  lines.push(alreadyPaidCount > 0 ? "Already paid:" : "Already paid: none.");
  for (const e of input.manuallyPaid) lines.push(`  • ${e.name} — marked paid`);
  for (const { entry, detected } of input.detectedPaid) {
    lines.push(`  • ${entry.name} — ${fmtUSD(detected)} detected via Venmo`);
  }
  lines.push("");

  lines.push(input.partial.length > 0 ? "Paid partially:" : "Paid partially: none.");
  for (const { entry, detected } of input.partial) {
    lines.push(`  • ${entry.name} — ${fmtUSD(detected)} of ${fmtUSD(entry.amount)}`);
  }
  lines.push("");

  lines.push(input.needsText.length > 0 ? "Needs a manual text (no email on file):" : "Needs a manual text: none.");
  for (const e of input.needsText) lines.push(`  • ${e.name} — ${e.phone || "no phone on file either"}`);
  lines.push("");

  // A run where sends fail (e.g. lapsed Gmail creds) must never read like a
  // quiet success — call it out by name, not just a buried count.
  lines.push(input.failed.length > 0 ? `Couldn't send (${input.failed.length}):` : "Couldn't send: none.");
  for (const e of input.failed) lines.push(`  • ${e.name}`);
  lines.push("");

  lines.push(
    `Totals: ${input.reminded.length} reminded, ${alreadyPaidCount} already paid, ${input.partial.length} partial, ${input.needsText.length} needs a text.`
  );
  lines.push(`Run at ${formatRunTimestamp(input.at)}.`);

  return { subject: `Rent auto-remind — ${phaseLabel}`, text: lines.join("\n") };
}
