"use client";

import { useMemo, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { BarRow } from "@/components/ui/Sparkline";
import { Avatar } from "@/components/ui/Avatar";
import { rentRoll, rentSummary, draftReminderText, RentStatus } from "@/lib/demo/payments";
import { findStylist } from "@/lib/demo/stylists";

const STATUS_TONE: Record<RentStatus, "moss" | "champagne" | "rose" | "neutral"> = {
  paid: "moss",
  partial: "champagne",
  outstanding: "neutral",
  late: "rose",
};

const STATUS_LABEL: Record<RentStatus, string> = {
  paid: "paid",
  partial: "partial",
  outstanding: "outstanding",
  late: "2nd nudge",
};

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function RentRollPage() {
  const summary = useMemo(() => rentSummary(), []);
  const [filter, setFilter] = useState<"all" | "outstanding" | "paid">("all");
  const [activeId, setActiveId] = useState<string | null>(rentRoll.find(r => r.status !== "paid")?.stylistId ?? null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const visible = rentRoll.filter(r => {
    if (filter === "all") return true;
    if (filter === "paid") return r.status === "paid";
    return r.status !== "paid";
  });

  const active = rentRoll.find(r => r.stylistId === activeId);
  const draft = active ? draftReminderText(active) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 04 · Cash</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Friday Rent Roll</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every Friday, the agent watches the bank + Venmo + Zelle feeds, matches payments against the
            roster, and drafts a reminder for whoever hasn't paid by EOD.
          </p>
        </div>
        <Illustrative />
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Collected" value={fmtUSD(summary.collected)} sub={`of ${fmtUSD(summary.total)}`} />
        <Stat label="Paid stylists"  value={`${summary.paidCount} / ${summary.totalStylists}`} />
        <Stat label="Outstanding"    value={fmtUSD(summary.outstanding)} sub={`${summary.outstandingCount} stylists`} />
        <Stat label="Reminders sent" value={String(rentRoll.reduce((a,r)=>a+r.remindersSent,0) + sent.size)} />
      </section>

      <Card>
        <CardHead eyebrow="This Friday · May 29" title="Collection progress" action={<Pill tone="moss">{Math.round(summary.collectedPct * 100)}% collected</Pill>} />
        <div className="mt-2"><BarRow value={summary.collected} max={summary.total} color="var(--color-champagne-400)" /></div>
        <div className="mt-2 flex gap-4 text-[11px] text-muted">
          <span><span className="inline-block h-2 w-2 rounded-full bg-moss-500" /> &nbsp;paid &nbsp;{summary.paidCount}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-champagne-400" /> &nbsp;partial &nbsp;{rentRoll.filter(r=>r.status==="partial").length}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-[#c8857a]" /> &nbsp;late &nbsp;{rentRoll.filter(r=>r.status==="late").length}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-moss-200" /> &nbsp;outstanding &nbsp;{rentRoll.filter(r=>r.status==="outstanding").length}</span>
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHead
            eyebrow="Roster"
            title="12 stylists"
            action={
              <div className="rounded-lg border border-moss-700/12 bg-white p-0.5 text-[12px]">
                {(["all","outstanding","paid"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={[
                      "rounded-md px-3 py-1 capitalize transition",
                      filter === f ? "bg-moss-700 text-cream" : "text-moss-700 hover:bg-moss-100/60",
                    ].join(" ")}
                  >
                    {f}
                  </button>
                ))}
              </div>
            }
          />
          <ul className="divide-y divide-moss-700/8">
            {visible.map(row => {
              const s = findStylist(row.stylistId);
              if (!s) return null;
              const reminded = sent.has(row.stylistId);
              return (
                <li key={row.stylistId}>
                  <button
                    onClick={() => setActiveId(row.stylistId)}
                    className={[
                      "flex w-full items-center gap-3 py-3 text-left transition",
                      activeId === row.stylistId ? "bg-champagne-100/30 -mx-2 rounded-xl px-2" : "",
                    ].join(" ")}
                  >
                    <Avatar initials={s.initials} hueDeg={s.hueDeg} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-moss-700">{s.name}</div>
                      <div className="text-[12px] text-muted">{row.chair} · {row.method}{row.paidAt ? ` · received ${row.paidAt.slice(11,16)}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-semibold text-moss-700">{fmtUSD(row.amountPaid)} / {fmtUSD(row.amountDue)}</div>
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        <Pill tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Pill>
                        {reminded && <Pill tone="champagne">just nudged</Pill>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHead eyebrow={active ? "Drafted reminder" : "Pick a stylist"} title={active ? `For ${active.name.split(" ")[0]}` : "—"} />
          {active && draft ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-moss-700/8 bg-cream p-4 text-[14px] leading-relaxed text-ink">
                {draft}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSent(prev => new Set(prev).add(active.stylistId))}
                  disabled={active.status === "paid" || sent.has(active.stylistId)}
                  className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
                >
                  {active.status === "paid" ? "Already paid ✓" : sent.has(active.stylistId) ? "Sent ✓" : `Send to ${active.name.split(" ")[0]}`}
                </button>
                <button className="rounded-lg border border-moss-700/15 bg-white px-4 py-2 text-sm font-medium text-moss-700 hover:border-moss-500">
                  Tweak tone ↻
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Demo mode shows the text only. Live mode sends via Twilio after a 5pm grace window.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Select a stylist on the left to see the drafted reminder.</p>
          )}
        </Card>
      </section>

      <Card>
        <CardHead eyebrow="Friday-night summary" title="What Belinda gets at 8pm" />
        <div className="rounded-xl border border-moss-700/8 bg-cream p-4 text-[14px] leading-relaxed text-ink">
          <p>
            <b>Friday roll:</b> {summary.paidCount} of {summary.totalStylists} stylists paid {fmtUSD(summary.collected)} of {fmtUSD(summary.total)} expected.
            {" "}{summary.outstandingCount} outstanding ({fmtUSD(summary.outstanding)}). I've sent first reminders to everyone partial/outstanding,
            and a second nudge to anyone late from last week. If anything is still unpaid by Monday morning, I'll escalate.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-moss-700">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}
