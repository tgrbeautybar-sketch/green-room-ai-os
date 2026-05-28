"use client";

import Link from "next/link";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { Sparkline } from "@/components/ui/Sparkline";
import { useViewAs } from "@/components/shell/ViewAsProvider";
import { metricsFor, dailySeries } from "@/lib/demo/bookings";
import { rentSummary } from "@/lib/demo/payments";
import { callScripts } from "@/lib/demo/calls";
import { stylists, findStylist } from "@/lib/demo/stylists";

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function Overview() {
  const { viewAsId } = useViewAs();
  const scope = viewAsId === "all" ? "all" : viewAsId;
  const m = metricsFor(scope, 30);
  const series = dailySeries(scope, 30);
  const rent = rentSummary();
  const scopeLabel =
    viewAsId === "all" ? "The Green Room (all 12)" : findStylist(viewAsId)?.name ?? "All stylists";

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="tile-grad relative overflow-hidden">
          <div className="absolute right-6 top-6"><Illustrative /></div>
          <div className="max-w-2xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-champagne-600">Friday, May 29 · 4:42 PM</div>
            <h1 className="mt-2 font-display text-4xl font-semibold text-moss-700 sm:text-5xl">
              Good afternoon, Belinda.
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Four tools, one room. The Post Studio drafted three posts overnight, Dashboard is showing
              this week's number, the Front Desk took {callScripts.length} calls so far, and Rent Roll is
              {" "}{rent.paidCount} of {rent.totalStylists} paid.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/tools/social" className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600">Open Post Studio →</Link>
              <Link href="/tools/dashboard" className="rounded-lg border border-moss-700/15 bg-white px-4 py-2 text-sm font-medium text-moss-700 transition hover:border-moss-500">Open Dashboard →</Link>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead eyebrow="Viewing" title={<span className="truncate">{scopeLabel}</span>} action={<Illustrative />} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Gross · 30d" value={fmtUSD(m.gross)} />
            <Stat label="Net · 30d" value={fmtUSD(m.net)} />
            <Stat label="Bookings" value={String(m.bookings)} />
            <Stat label="Retention" value={`${Math.round(m.retention * 100)}%`} />
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted">Daily gross · last 30</div>
            <Sparkline data={series} />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ToolTile
          href="/tools/social"
          eyebrow="Tool 01 · Social"
          title="Post Studio"
          stat="3 drafts ready"
          sub="for Belinda's review"
          dot="moss"
        />
        <ToolTile
          href="/tools/dashboard"
          eyebrow="Tool 02 · Numbers"
          title="Salon Dashboard"
          stat={fmtUSD(m.gross)}
          sub="gross · trailing 30 days"
          dot="champagne"
        />
        <ToolTile
          href="/tools/voice"
          eyebrow="Tool 03 · Voice"
          title="Front Desk Agent"
          stat={`${callScripts.length} calls`}
          sub="handled today, 2 booked"
          dot="moss"
        />
        <ToolTile
          href="/tools/rent"
          eyebrow="Tool 04 · Cash"
          title="Friday Rent Roll"
          stat={`${rent.paidCount}/${rent.totalStylists}`}
          sub={`${fmtUSD(rent.collected)} of ${fmtUSD(rent.total)} collected`}
          dot="champagne"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead eyebrow="Today" title="At a glance" />
          <ul className="space-y-3">
            <Bullet><b>{stylists.length}</b> stylists working out of {new Set(stylists.map(s => s.chair.split(" ")[0])).size} chair types.</Bullet>
            <Bullet><b>{m.bookings}</b> bookings in the last 30 days · avg ticket <b>{fmtUSD(m.avgTicket)}</b>.</Bullet>
            <Bullet>Top service this month: <b>{m.topService}</b>.</Bullet>
            <Bullet><b>{rent.outstandingCount}</b> stylists still owe Friday rent — reminders queued.</Bullet>
          </ul>
        </Card>
        <Card>
          <CardHead eyebrow="How they fit together" title="One room. Four agents." />
          <ol className="space-y-3 text-sm leading-relaxed text-muted">
            <li><Pill tone="moss">1</Pill> &nbsp; <b className="text-moss-700">Post Studio</b> drafts in Green Room's voice — you approve from your phone.</li>
            <li><Pill tone="moss">2</Pill> &nbsp; <b className="text-moss-700">Dashboard</b> turns Vagaro + your bank into one number per question.</li>
            <li><Pill tone="moss">3</Pill> &nbsp; <b className="text-moss-700">Front Desk</b> answers every call, routes to the right stylist, never sleeps.</li>
            <li><Pill tone="moss">4</Pill> &nbsp; <b className="text-moss-700">Rent Roll</b> matches Friday Venmos against the roster and chases the rest.</li>
          </ol>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-moss-700">{value}</div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-muted">
      <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-champagne-400" />
      <span>{children}</span>
    </li>
  );
}

function ToolTile({
  href, eyebrow, title, stat, sub, dot,
}: { href: string; eyebrow: string; title: string; stat: string; sub: string; dot: "moss" | "champagne" }) {
  const dotClr = dot === "moss" ? "bg-moss-500" : "bg-champagne-400";
  return (
    <Link href={href} className="group">
      <Card className="tile-grad relative h-full transition hover:-translate-y-0.5 hover:shadow-[0_2px_0_rgba(31,61,46,0.06),0_18px_30px_-18px_rgba(31,61,46,0.22)]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">{eyebrow}</div>
          <span className={`block h-2 w-2 rounded-full ${dotClr}`} />
        </div>
        <h3 className="mt-3 font-display text-xl font-semibold text-moss-700">{title}</h3>
        <div className="mt-4 font-display text-3xl font-semibold text-moss-800">{stat}</div>
        <div className="mt-1 text-[13px] text-muted">{sub}</div>
        <div className="mt-5 text-[13px] font-medium text-moss-500 transition group-hover:text-moss-700">
          Open →
        </div>
      </Card>
    </Link>
  );
}
