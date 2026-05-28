"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useViewAs, viewAsOptions } from "./ViewAsProvider";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/tools/social", label: "Post Studio" },
  { href: "/tools/dashboard", label: "Dashboard" },
  { href: "/tools/voice", label: "Front Desk" },
  { href: "/tools/rent", label: "Rent Roll" },
];

export default function Topbar() {
  const path = usePathname();
  const { viewAsId, setViewAsId } = useViewAs();

  return (
    <header className="sticky top-0 z-30 border-b border-moss-700/10 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-moss-700 text-cream shadow-sm">
            <span className="font-display text-lg leading-none">G</span>
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight text-moss-700">The Green Room</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Beauty Bar · AI OS</div>
          </div>
        </Link>

        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto pt-1 sm:order-2 sm:ml-6 sm:w-auto sm:pt-0">
          {NAV.map(n => {
            const active = n.href === "/" ? path === "/" : path?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  active
                    ? "bg-moss-700 text-cream shadow-sm"
                    : "text-moss-700 hover:bg-moss-100/60",
                ].join(" ")}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <label htmlFor="viewas" className="hidden text-[11px] uppercase tracking-[0.14em] text-muted sm:block">View as</label>
          <select
            id="viewas"
            value={viewAsId}
            onChange={e => setViewAsId(e.target.value)}
            className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-sm text-moss-700 shadow-sm outline-none transition focus:border-moss-500"
          >
            {viewAsOptions().map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>
    </header>
  );
}
