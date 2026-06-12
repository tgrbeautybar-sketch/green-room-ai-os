"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { Sparkline, BarRow } from "@/components/ui/Sparkline";
import { Avatar } from "@/components/ui/Avatar";
import { stylists } from "@/lib/demo/stylists";
import { metricsFor, dailySeries, bookings } from "@/lib/demo/bookings";
import { rentSummary } from "@/lib/demo/payments";

const WINDOWS: { id: number; label: string }[] = [
  { id: 7,  label: "7d"  },
  { id: 30, label: "30d" },
  { id: 90, label: "90d" },
];

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type SourceMode = "demo" | "vagaro" | "csv";

export default function Dashboard() {
  const [win, setWin] = useState(30);

  // Where the numbers come from — demo (default), Vagaro API, or a CSV upload
  const [sourceMode, setSourceMode] = useState<SourceMode>("demo");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<number | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const csvFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/source").then(async r => {
      if (!r.ok) return;
      const data = (await r.json()) as { mode: SourceMode; fileName: string | null; rows: number | null };
      setSourceMode(data.mode);
      setCsvFileName(data.fileName);
      setCsvRows(data.rows);
    }).catch(() => {});
  }, []);

  async function setSource(mode: SourceMode, extra?: { fileName: string; rows: number }) {
    setSourceBusy(true);
    try {
      const res = await fetch("/api/dashboard/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...extra }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSourceMode(mode);
      setCsvFileName(extra?.fileName ?? null);
      setCsvRows(extra?.rows ?? null);
    } catch {
      /* keep previous state on failure */
    } finally {
      setSourceBusy(false);
    }
  }

  function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").split(/\r?\n/).filter(l => l.trim().length > 0);
      const rows = Math.max(0, lines.length - 1); // minus header
      setSource("csv", { fileName: file.name, rows });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const m = useMemo(() => metricsFor("all", win), [win]);
  const prev = useMemo(() => {
    const cur = metricsFor("all", win);
    const prev = metricsFor("all", win * 2);
    return { gross: cur.gross - (prev.gross - cur.gross), netDelta: cur.net - (prev.net - cur.net) };
  }, [win]);
  const series = useMemo(() => dailySeries("all", win), [win]);
  const rent = rentSummary();

  // Per-stylist board — owner view of the whole room
  const leaderboard = useMemo(() => {
    return stylists
      .map(s => ({ s, m: metricsFor(s.id, win) }))
      .sort((a, b) => b.m.gross - a.m.gross);
  }, [win]);

  // Service mix (top 5 by revenue, salon-wide)
  const mix = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      if (b.daysAgo >= win) continue;
      map.set(b.service.name, (map.get(b.service.name) ?? 0) + b.price);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [win]);
  const mixMax = mix[0]?.[1] ?? 0;

  const scopeLabel = "All stylists";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 02 · Numbers</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Salon Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            One screen, one source of truth. Vagaro bookings + bank deposits + rent roll, rolled into the
            numbers Belinda needs to answer her own questions without a CPA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Illustrative />
          <div className="rounded-lg border border-moss-700/12 bg-white p-0.5 text-[12px]">
            {WINDOWS.map(w => (
              <button
                key={w.id}
                onClick={() => setWin(w.id)}
                className={[
                  "rounded-md px-3 py-1 transition",
                  win === w.id ? "bg-moss-700 text-cream" : "text-moss-700 hover:bg-moss-100/60",
                ].join(" ")}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={[
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-cream",
                sourceMode === "demo" ? "bg-moss-300" : "bg-moss-600",
              ].join(" ")}
            >
              {sourceMode === "demo" ? "◌" : "●"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-moss-700">Data source</span>
                <Pill tone={sourceMode === "demo" ? "champagne" : "moss"}>
                  {sourceMode === "demo" ? "Demo data" : sourceMode === "vagaro" ? "Live-ready · Vagaro" : "CSV import"}
                </Pill>
              </div>
              <div className="text-[12px] text-muted">
                {sourceMode === "vagaro"
                  ? "Vagaro Transactions webhook streams Belinda's sales in real time. Flip env keys to go live."
                  : sourceMode === "csv"
                  ? <>Imported <b className="text-moss-700">{csvFileName}</b>{csvRows != null && <> · {csvRows.toLocaleString()} rows</>}. Re-upload anytime.</>
                  : "Showing illustrative demo numbers. Connect Vagaro for live data, or upload a Vagaro CSV export."}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input ref={csvFileRef} type="file" accept=".csv,.txt" hidden onChange={onCsvFile} />
            <button
              onClick={() => setSource("vagaro")}
              disabled={sourceBusy}
              className={[
                "rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60",
                sourceMode === "vagaro"
                  ? "bg-moss-700 text-cream"
                  : "border border-moss-700/15 bg-white text-moss-700 hover:border-moss-500",
              ].join(" ")}
            >
              {sourceMode === "vagaro" ? "Vagaro connected ✓" : "Connect Vagaro"}
            </button>
            <button
              onClick={() => csvFileRef.current?.click()}
              disabled={sourceBusy}
              className={[
                "rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60",
                sourceMode === "csv"
                  ? "bg-moss-700 text-cream"
                  : "border border-moss-700/15 bg-white text-moss-700 hover:border-moss-500",
              ].join(" ")}
            >
              {sourceMode === "csv" ? "Re-upload CSV" : "Upload CSV"}
            </button>
            {sourceMode !== "demo" && (
              <button
                onClick={() => setSource("demo")}
                disabled={sourceBusy}
                className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-muted transition hover:border-moss-500 hover:text-moss-700 disabled:opacity-60"
              >
                Back to demo
              </button>
            )}
          </div>
        </div>
      </Card>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Gross" value={fmtUSD(m.gross)} delta={prev.gross} />
        <Stat label="Net (after COGS)" value={fmtUSD(m.net)} delta={prev.netDelta} />
        <Stat label="Bookings" value={String(m.bookings)} />
        <Stat label="Retention" value={`${Math.round(m.retention * 100)}%`} sub={`avg ticket ${fmtUSD(m.avgTicket)}`} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHead
            eyebrow={`Daily gross · last ${win} days`}
            title={<span>{scopeLabel}</span>}
            action={<Pill tone="moss">{m.topService}</Pill>}
          />
          <Sparkline data={series} height={140} />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
            <span>peak day · {fmtUSD(Math.max(...series))}</span>
            <span>quiet day · {fmtUSD(Math.min(...series))}</span>
            <span>avg/day · {fmtUSD(Math.round(m.gross / win))}</span>
          </div>
        </Card>

        <Card>
          <CardHead eyebrow="Service mix" title="Where the money comes from" />
          <ul className="space-y-3">
            {mix.map(([name, rev]) => (
              <li key={name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="font-medium text-moss-700">{name}</span>
                  <span className="text-muted">{fmtUSD(rev)}</span>
                </div>
                <BarRow value={rev} max={mixMax} />
              </li>
            ))}
            {mix.length === 0 && <li className="text-sm text-muted">No bookings in this window.</li>}
          </ul>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHead
            eyebrow="Stylist leaderboard"
            title="Who's bringing the room up"
          />
          <ul className="divide-y divide-moss-700/8">
            {leaderboard.map(({ s, m: sm }, idx) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="w-5 text-right text-[11px] tabular-nums text-muted">{idx + 1}</span>
                <Avatar initials={s.initials} hueDeg={s.hueDeg} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-moss-700">{s.name}</div>
                  <div className="text-[12px] text-muted">{s.role} · {s.chair} · {sm.bookings} bookings</div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-semibold text-moss-700">{fmtUSD(sm.gross)}</div>
                  <div className="text-[11px] text-muted">{Math.round(sm.retention * 100)}% retention</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead eyebrow="Friday rent" title="This week's roll" />
            <div className="font-display text-3xl font-semibold text-moss-700">{fmtUSD(rent.collected)}</div>
            <div className="text-[12px] text-muted">of {fmtUSD(rent.total)} · {Math.round(rent.collectedPct * 100)}% collected</div>
            <div className="mt-3"><BarRow value={rent.collected} max={rent.total} color="var(--color-champagne-400)" /></div>
            <div className="mt-3 text-[12px] text-muted">
              <b className="text-moss-700">{rent.paidCount}</b> paid · <b className="text-moss-700">{rent.outstandingCount}</b> outstanding
            </div>
          </Card>

          <Card>
            <CardHead eyebrow="Chair occupancy" title="What's full, what isn't" />
            <ul className="space-y-2">
              {stylists.map(s => {
                const sm = metricsFor(s.id, 7);
                const occ = Math.min(1, sm.bookings / 28); // 4/day target
                return (
                  <li key={s.id} className="flex items-center gap-2 text-[12px]">
                    <span className="w-24 shrink-0 truncate text-muted">{s.chair}</span>
                    <BarRow value={occ * 100} max={100} color={occ > 0.75 ? "var(--color-moss-500)" : occ > 0.4 ? "var(--color-champagne-400)" : "#c8857a"} />
                    <span className="w-9 shrink-0 text-right tabular-nums text-moss-700">{Math.round(occ * 100)}%</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, delta, sub }: { label: string; value: string; delta?: number; sub?: string }) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 font-display text-3xl font-semibold text-moss-700">{value}</div>
      <div className="mt-1 text-[11px] text-muted">
        {sub
          ? sub
          : delta !== undefined
          ? <span className={positive ? "text-moss-500" : "text-[#9a4a32]"}>{positive ? "▲" : "▼"} vs. prior window</span>
          : "this window"}
      </div>
    </Card>
  );
}
