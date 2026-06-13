"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";

type SourceMode = "demo" | "vagaro" | "csv";

export default function Dashboard() {
  // Where the numbers will come from — none connected yet.
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
      setSource("csv", { fileName: file.name, rows: Math.max(0, lines.length - 1) });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 02 · Numbers</div>
        <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Salon Dashboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One screen for your numbers — gross, net, retention, occupancy, and rent — pulled from your
          booking system and bank, so you can answer your own questions without a CPA.
        </p>
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
              {sourceMode === "demo" ? "○" : "●"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-moss-700">Data source</span>
                <Pill tone={sourceMode === "demo" ? "neutral" : "moss"}>
                  {sourceMode === "demo" ? "Not connected" : sourceMode === "vagaro" ? "Vagaro" : "CSV import"}
                </Pill>
              </div>
              <div className="text-[12px] text-muted">
                {sourceMode === "vagaro"
                  ? "Vagaro connected — live revenue will populate once the data pipeline is enabled."
                  : sourceMode === "csv"
                  ? <>Imported <b className="text-moss-700">{csvFileName}</b>{csvRows != null && <> · {csvRows.toLocaleString()} rows</>}.</>
                  : "Connect your booking system or upload an export to see your numbers."}
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
                sourceMode === "vagaro" ? "bg-moss-700 text-cream" : "border border-moss-700/15 bg-white text-moss-700 hover:border-moss-500",
              ].join(" ")}
            >
              {sourceMode === "vagaro" ? "Vagaro connected ✓" : "Connect Vagaro"}
            </button>
            <button
              onClick={() => csvFileRef.current?.click()}
              disabled={sourceBusy}
              className={[
                "rounded-lg px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60",
                sourceMode === "csv" ? "bg-moss-700 text-cream" : "border border-moss-700/15 bg-white text-moss-700 hover:border-moss-500",
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
                Disconnect
              </button>
            )}
          </div>
        </div>
      </Card>

      <EmptyState
        eyebrow="Your numbers"
        title="No data yet"
        description="Once your booking system (Vagaro) and bank (Plaid) are connected, your gross, net, retention, chair occupancy, and rent roll will show up here — updated in real time."
      />
    </div>
  );
}
