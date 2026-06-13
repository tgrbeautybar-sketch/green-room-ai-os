"use client";

import Link from "next/link";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

export default function Overview() {
  return (
    <div className="space-y-8">
      <section>
        <Card className="tile-grad relative overflow-hidden">
          <div className="max-w-2xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-champagne-600">The Green Room · AI OS</div>
            <h1 className="mt-2 font-display text-4xl font-semibold text-moss-700 sm:text-5xl">
              Welcome, Belinda.
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Four tools, one room. Post Studio drafts your social in the Green Room voice, the Dashboard
              turns your bookings and bank into one screen of numbers, the Front Desk answers your calls,
              and the Rent Roll handles Friday. Everything fills in as each piece connects.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/tools/social" className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600">Open Post Studio →</Link>
              <Link href="/tools/voice" className="rounded-lg border border-moss-700/15 bg-white px-4 py-2 text-sm font-medium text-moss-700 transition hover:border-moss-500">Open Front Desk →</Link>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ToolTile href="/tools/social"    eyebrow="Tool 01 · Social"  title="Post Studio"      sub="Draft & schedule to Instagram + Facebook" dot="moss" />
        <ToolTile href="/tools/dashboard" eyebrow="Tool 02 · Numbers" title="Salon Dashboard"   sub="Your revenue, retention & occupancy"       dot="champagne" />
        <ToolTile href="/tools/voice"     eyebrow="Tool 03 · Voice"   title="Front Desk Agent"  sub="Sage answers, routes & takes messages"     dot="moss" />
        <ToolTile href="/tools/rent"      eyebrow="Tool 04 · Cash"    title="Friday Rent Roll"  sub="Track payments & drafted reminders"        dot="champagne" />
      </section>

      <section>
        <Card>
          <CardHead eyebrow="How they fit together" title="One room. Four agents." />
          <ol className="space-y-3 text-sm leading-relaxed text-muted">
            <li><Pill tone="moss">1</Pill> &nbsp; <b className="text-moss-700">Post Studio</b> drafts in Green Room's voice — you approve from your phone.</li>
            <li><Pill tone="moss">2</Pill> &nbsp; <b className="text-moss-700">Dashboard</b> turns your bookings + bank into one number per question.</li>
            <li><Pill tone="moss">3</Pill> &nbsp; <b className="text-moss-700">Front Desk</b> answers every call, routes to the right stylist, never sleeps.</li>
            <li><Pill tone="moss">4</Pill> &nbsp; <b className="text-moss-700">Rent Roll</b> matches Friday payments against the roster and drafts the rest.</li>
          </ol>
        </Card>
      </section>
    </div>
  );
}

function ToolTile({
  href, eyebrow, title, sub, dot,
}: { href: string; eyebrow: string; title: string; sub: string; dot: "moss" | "champagne" }) {
  const dotClr = dot === "moss" ? "bg-moss-500" : "bg-champagne-400";
  return (
    <Link href={href} className="group">
      <Card className="tile-grad relative h-full transition hover:-translate-y-0.5 hover:shadow-[0_2px_0_rgba(31,61,46,0.06),0_18px_30px_-18px_rgba(31,61,46,0.22)]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">{eyebrow}</div>
          <span className={`block h-2 w-2 rounded-full ${dotClr}`} />
        </div>
        <h3 className="mt-3 font-display text-xl font-semibold text-moss-700">{title}</h3>
        <div className="mt-2 text-[13px] text-muted">{sub}</div>
        <div className="mt-5 text-[13px] font-medium text-moss-500 transition group-hover:text-moss-700">
          Open →
        </div>
      </Card>
    </Link>
  );
}
