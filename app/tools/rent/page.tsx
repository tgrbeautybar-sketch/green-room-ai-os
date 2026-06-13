"use client";

import { EmptyState } from "@/components/ui/EmptyState";

export default function RentRollPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 04 · Cash</div>
        <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Friday Rent Roll</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every Friday, the agent matches incoming payments against your roster and drafts a reminder — in
          your voice — for whoever hasn't paid by end of day.
        </p>
      </header>

      <EmptyState
        eyebrow="Rent roll"
        title="No roster yet"
        description="Once your stylist roster and rent terms are added (and the bank feed connected), Friday's collection progress, who's paid, and drafted reminders will appear here."
      />
    </div>
  );
}
