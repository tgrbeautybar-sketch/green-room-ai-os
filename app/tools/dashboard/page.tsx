"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { Sparkline } from "@/components/ui/Sparkline";

// ---------- types (mirror lib/metrics.ts + app/api/dashboard/metrics/route.ts) ----------

type WindowDays = 7 | 30 | 90;
type Mode = "demo" | "live" | "csv" | "empty";

type TopService = { name: string; share: number } | null;

type Metrics = {
  gross: number;
  avgTicket: number;
  bookings: number;
  topService: TopService;
  repeatClientRate: number | null;
  cogs: number | null;
  net: number | null;
  totalIncome?: number; // blended sales + rent total — the server doesn't send this yet
};

type Coverage = { from: string; to: string; days: number };
type SeriesPoint = { date: string; gross: number };
type RentMetrics = { collected: number; outstanding: number; expected: number; paidCount: number; renterCount: number };

type MetricsResponse = {
  mode: Mode;
  window: number;
  metrics: Metrics;
  rent: RentMetrics;
  series: SeriesPoint[];
  coverage: Coverage;
  error?: string;
};

type CsvMapping = { date?: string; gross?: string; tip?: string; item?: string; customer?: string; transactionId?: string };
type DashboardConfig = { cogsPct: number | null; workingHours: number | null; csvMapping: CsvMapping | null };
const DEFAULT_CONFIG: DashboardConfig = { cogsPct: null, workingHours: null, csvMapping: null };

type CsvStep =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "needsMapping"; headers: string[]; sampleRow: Record<string, string>; fileName: string; rawText: string }
  | { kind: "success"; imported: number; skipped: number; through: string | null }
  | { kind: "error"; message: string };

// ---------- formatting helpers ----------

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

function coverageLabel(coverage: Coverage, win: number): string {
  if (coverage.days < win) return `Last ${win} days · data since ${fmtShortDate(coverage.from)}`;
  return `Last ${win} days`;
}

export default function Dashboard() {
  const [win, setWin] = useState<WindowDays>(30);
  const [demoPreview, setDemoPreview] = useState(false);

  const [data, setData] = useState<MetricsResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  const fetchIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [cogsInput, setCogsInput] = useState("");
  const [hoursInput, setHoursInput] = useState("");
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const settingsRef = useRef<HTMLDetailsElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvStep, setCsvStep] = useState<CsvStep>({ kind: "idle" });
  const [mapDate, setMapDate] = useState("");
  const [mapAmount, setMapAmount] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);

  const fetchMetrics = useCallback(async () => {
    const id = ++fetchIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (hasDataRef.current) setRefreshing(true);

    try {
      const qs = new URLSearchParams({ window: String(win) });
      if (demoPreview) qs.set("preview", "1");
      const res = await fetch(`/api/dashboard/metrics?${qs.toString()}`, { signal: controller.signal });
      if (fetchIdRef.current !== id) return; // superseded by a newer request
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as MetricsResponse;
      if (fetchIdRef.current !== id) return;
      setData(json);
      hasDataRef.current = true;
      setFetchError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (fetchIdRef.current !== id) return;
      setFetchError("Couldn't load your numbers right now. This is usually temporary — try again.");
    } finally {
      if (fetchIdRef.current === id) setRefreshing(false);
    }
  }, [win, demoPreview]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    fetch("/api/dashboard/source")
      .then(async r => {
        if (!r.ok) return;
        const d = (await r.json()) as DashboardConfig;
        setConfig(d);
        setCogsInput(d.cogsPct != null ? String(d.cogsPct) : "");
        setHoursInput(d.workingHours != null ? String(d.workingHours) : "");
      })
      .catch(() => {});
  }, []);

  // Default the mapping selects to the first couple of headers when a file needs mapping.
  useEffect(() => {
    if (csvStep.kind === "needsMapping") {
      setMapDate(csvStep.headers[0] ?? "");
      setMapAmount(csvStep.headers[1] ?? csvStep.headers[0] ?? "");
    }
  }, [csvStep]);

  async function saveSettings() {
    const cogsPct = cogsInput.trim() === "" ? null : Number(cogsInput);
    const workingHours = hoursInput.trim() === "" ? null : Number(hoursInput);
    setSettingsSaveState("saving");
    try {
      const res = await fetch("/api/dashboard/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cogsPct, workingHours }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as DashboardConfig;
      setConfig(prev => ({ ...prev, cogsPct: d.cogsPct, workingHours: d.workingHours }));
      setSettingsSaveState("saved");
      fetchMetrics();
      setTimeout(() => setSettingsSaveState("idle"), 1500);
    } catch {
      setSettingsSaveState("error");
      setTimeout(() => setSettingsSaveState("idle"), 2400);
    }
  }

  function openSettings() {
    const el = settingsRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openFilePicker() {
    setCsvStep({ kind: "idle" });
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCsvStep({ kind: "uploading" });
    try {
      const text = await file.text();
      await runImport(text, file.name);
    } catch {
      setCsvStep({ kind: "error", message: "read" });
    }
  }

  async function runImport(csvText: string, fileName: string, mapping?: CsvMapping) {
    setCsvStep({ kind: "uploading" });
    try {
      const res = await fetch("/api/dashboard/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, fileName, mapping: mapping ?? config.csvMapping ?? undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        needsMapping?: boolean;
        headers?: string[];
        sampleRow?: Record<string, string>;
        imported?: number;
        skipped?: number;
        dateRange?: { from: string; to: string } | null;
        error?: string;
      };

      if (json.needsMapping) {
        setCsvStep({
          kind: "needsMapping",
          headers: json.headers ?? [],
          sampleRow: json.sampleRow ?? {},
          fileName,
          rawText: csvText,
        });
        return;
      }
      if (!json.ok) {
        setCsvStep({ kind: "error", message: "server" });
        return;
      }

      setCsvStep({
        kind: "success",
        imported: json.imported ?? 0,
        skipped: json.skipped ?? 0,
        through: json.dateRange?.to ?? null,
      });
      fetchMetrics();
    } catch {
      setCsvStep({ kind: "error", message: "network" });
    }
  }

  async function confirmMapping() {
    if (csvStep.kind !== "needsMapping") return;
    const mapping: CsvMapping = { date: mapDate, gross: mapAmount };
    try {
      await fetch("/api/dashboard/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvMapping: mapping }),
      });
      setConfig(prev => ({ ...prev, csvMapping: mapping }));
    } catch {
      /* the import retry below still works even if persisting the mapping failed */
    }
    await runImport(csvStep.rawText, csvStep.fileName, mapping);
  }

  async function clearImported() {
    setConfirmingClear(false);
    try {
      await fetch("/api/dashboard/import", { method: "DELETE" });
    } finally {
      fetchMetrics();
    }
  }

  const mode = data?.mode ?? null;
  const metrics = data?.metrics ?? null;
  const rent = data?.rent ?? null;
  const series = data?.series ?? [];
  const coverage = data?.coverage ?? null;
  const isDemo = mode === "demo";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 02 · Numbers</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Salon Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your own numbers — sales, average ticket, top service, repeat clients — plus the rent you collect.
            No CPA required.
          </p>
        </div>

        {mode !== "empty" && (
          <div className="flex items-center gap-2">
            {refreshing && <span className="text-[11px] text-muted">Refreshing…</span>}
            <div className="flex w-full gap-1 rounded-xl border border-moss-700/12 bg-cream/60 p-1 sm:w-auto sm:inline-flex">
              {([7, 30, 90] as WindowDays[]).map(w => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={win === w}
                  onClick={() => setWin(w)}
                  className={[
                    "flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition sm:flex-none",
                    win === w ? "bg-moss-700 text-cream shadow-sm" : "text-moss-700 hover:bg-white/70",
                  ].join(" ")}
                >
                  {w}d
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {fetchError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]"
        >
          <span>{fetchError}</span>
          <button
            type="button"
            onClick={() => fetchMetrics()}
            className="rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32]"
          >
            Try again
          </button>
        </div>
      )}

      {data === null && !fetchError && <DashboardSkeleton />}

      {data && metrics && rent && (
        <>
          {mode === "demo" && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-champagne-300 bg-champagne-100 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-champagne-400 text-[11px] font-bold text-cream">
                  !
                </span>
                <p className="text-[13px] leading-relaxed text-champagne-600">
                  <b className="font-semibold">Sample data — for demonstration only.</b> These are not your real
                  numbers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDemoPreview(false)}
                className="rounded-lg border border-champagne-300 bg-white px-3 py-1.5 text-[12px] font-medium text-champagne-600 transition hover:border-champagne-400"
              >
                Show my real numbers
              </button>
            </div>
          )}

          {mode !== "empty" ? (
            <>
              <ProvenanceCard
                mode={mode!}
                coverage={coverage}
                refreshing={refreshing}
                confirmingClear={confirmingClear}
                onUpload={openFilePicker}
                onRefresh={fetchMetrics}
                onRequestClear={() => setConfirmingClear(true)}
                onCancelClear={() => setConfirmingClear(false)}
                onConfirmClear={clearImported}
              />

              {typeof metrics.totalIncome === "number" && (
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Total income" value={fmtUSD(metrics.totalIncome)} sub="Sales + rent" illustrative={isDemo} />
                </section>
              )}

              <div className={refreshing ? "space-y-4 opacity-60 transition" : "space-y-4 transition"}>
                <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Your salon sales</h2>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Sales" value={fmtUSD(metrics.gross)} sub="Your service & retail sales" illustrative={isDemo} />
                  <Stat label="Average ticket" value={fmtUSD(metrics.avgTicket)} sub="Per booking" illustrative={isDemo} />
                  <Stat label="Bookings" value={String(metrics.bookings)} sub="Appointments in this period" illustrative={isDemo} />
                  <Stat
                    label="Top service"
                    value={metrics.topService ? metrics.topService.name : "—"}
                    sub={metrics.topService ? `${metrics.topService.share}% of sales` : "No standout yet"}
                    illustrative={isDemo}
                  />
                  <Stat
                    label="Repeat clients"
                    value={metrics.repeatClientRate != null ? `${Math.round(metrics.repeatClientRate * 100)}%` : "—"}
                    sub="Clients who came back"
                    illustrative={isDemo}
                  />
                  {metrics.cogs != null && metrics.net != null ? (
                    <>
                      <Stat
                        label="Estimated costs"
                        value={fmtUSD(metrics.cogs)}
                        hint={`Estimated from the ${config.cogsPct ?? "—"}% you entered`}
                        illustrative={isDemo}
                      />
                      <Stat
                        label="Estimated net"
                        value={fmtUSD(metrics.net)}
                        hint="Estimated — sales minus your cost estimate"
                        illustrative={isDemo}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={openSettings}
                      className="rounded-2xl border border-dashed border-moss-700/20 bg-white/60 p-5 text-left text-[13px] leading-relaxed text-muted transition hover:border-moss-300 hover:text-moss-700 sm:col-span-2 lg:col-span-2"
                    >
                      Want an estimated profit number? Add your product/supply cost % in Settings ↓
                    </button>
                  )}
                </section>

                <Card>
                  <CardHead eyebrow="Trend" title="Daily sales" action={isDemo ? <Illustrative /> : undefined} />
                  {coverage && coverage.days >= 2 ? (
                    <>
                      <Sparkline data={series.map(p => p.gross)} />
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                        <span>{fmtShortDate(coverage.from)}</span>
                        <span>{coverageLabel(coverage, win)}</span>
                        <span>{fmtShortDate(coverage.to)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted">Not enough days yet to show a trend.</p>
                  )}
                </Card>
              </div>

              {csvStep.kind !== "idle" && (
                <CsvFlow
                  step={csvStep}
                  mapDate={mapDate}
                  mapAmount={mapAmount}
                  onMapDate={setMapDate}
                  onMapAmount={setMapAmount}
                  onConfirmMapping={confirmMapping}
                  onRetry={openFilePicker}
                />
              )}
            </>
          ) : (
            <>
              <EmptyOnboardingCard onUpload={openFilePicker} onPreview={() => setDemoPreview(true)} />
              {csvStep.kind !== "idle" && (
                <CsvFlow
                  step={csvStep}
                  mapDate={mapDate}
                  mapAmount={mapAmount}
                  onMapDate={setMapDate}
                  onMapAmount={setMapAmount}
                  onConfirmMapping={confirmMapping}
                  onRetry={openFilePicker}
                />
              )}
            </>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Rent you collect</h2>
              <a href="/tools/rent" className="text-[12px] font-medium text-moss-500 underline hover:text-moss-700">
                View rent roll →
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Rent collected" value={fmtUSD(rent.collected)} sub={`${rent.paidCount} of ${rent.renterCount} paid`} />
              <Stat
                label="Rent outstanding"
                value={fmtUSD(rent.outstanding)}
                sub={`${Math.max(0, rent.renterCount - rent.paidCount)} still to pay`}
              />
              <Stat
                label="Collected"
                value={`${rent.expected ? Math.round((rent.collected / rent.expected) * 100) : 0}%`}
                sub="of expected rent"
              />
            </div>
          </section>

          <details ref={settingsRef} className="rounded-2xl border border-moss-700/8 bg-white p-5">
            <summary className="cursor-pointer font-display text-lg font-semibold text-moss-700">Settings</summary>
            <div className="mt-4 space-y-5">
              <div>
                <label htmlFor="cogsPct" className="block text-[12px] font-medium text-moss-700">
                  Product &amp; supply cost (% of sales) — optional
                </label>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  If you enter this, we'll show an estimated profit number. Leave it blank and we'll only show sales.
                </p>
                <input
                  id="cogsPct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={cogsInput}
                  onChange={e => setCogsInput(e.target.value)}
                  onBlur={saveSettings}
                  placeholder="e.g. 18"
                  className="mt-2 w-32 rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
                />
              </div>

              <div>
                <label htmlFor="workingHours" className="block text-[12px] font-medium text-moss-700">
                  Working hours / week — optional
                </label>
                <input
                  id="workingHours"
                  type="number"
                  min={0}
                  value={hoursInput}
                  onChange={e => setHoursInput(e.target.value)}
                  onBlur={saveSettings}
                  placeholder="e.g. 35"
                  className="mt-2 w-32 rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-moss-700/10 bg-cream/50 px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium text-moss-700">Preview with sample data</div>
                  <div className="text-[12px] leading-relaxed text-muted">
                    Fills the dashboard with made-up numbers for demos. Clearly labeled everywhere.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={demoPreview}
                  onClick={() => setDemoPreview(v => !v)}
                  className={[
                    "relative h-6 w-11 shrink-0 rounded-full transition",
                    demoPreview ? "bg-moss-600" : "bg-moss-200",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                      demoPreview ? "left-5" : "left-0.5",
                    ].join(" ")}
                  />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={settingsSaveState === "saving"}
                  className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
                >
                  {settingsSaveState === "saving"
                    ? "Saving…"
                    : settingsSaveState === "saved"
                    ? "Saved ✓"
                    : settingsSaveState === "error"
                    ? "Save failed — retry"
                    : "Save"}
                </button>
              </div>
            </div>
          </details>
        </>
      )}

      <input ref={fileInputRef} type="file" accept=".csv,.txt" hidden onChange={onFileSelected} />
    </div>
  );
}

// ---------- subcomponents ----------

function Stat({
  label,
  value,
  sub,
  hint,
  illustrative,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  illustrative?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
        {illustrative && <Illustrative />}
      </div>
      <div className="mt-1 truncate font-display text-2xl font-semibold text-moss-700">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
      {hint && <div className="mt-1 text-[11px] text-champagne-600">{hint}</div>}
    </Card>
  );
}

function ProvenanceCard({
  mode,
  coverage,
  refreshing,
  confirmingClear,
  onUpload,
  onRefresh,
  onRequestClear,
  onCancelClear,
  onConfirmClear,
}: {
  mode: Mode;
  coverage: Coverage | null;
  refreshing: boolean;
  confirmingClear: boolean;
  onUpload: () => void;
  onRefresh: () => void;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
}) {
  if (mode === "csv") {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-moss-500" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-moss-700">Your numbers</span>
                <Pill tone="moss">Imported</Pill>
              </div>
              <div className="text-[12px] text-muted">
                Showing your imported sales — through {coverage ? fmtShortDate(coverage.to) : "—"}.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onUpload}
              className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500"
            >
              Upload another export
            </button>
            {confirmingClear ? (
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
                <span className="text-[#9a4a32]">Clear these numbers?</span>
                <button
                  type="button"
                  onClick={onConfirmClear}
                  className="rounded-md bg-[#9a4a32] px-2.5 py-1 font-medium text-cream hover:opacity-90"
                >
                  Yes, clear
                </button>
                <button
                  type="button"
                  onClick={onCancelClear}
                  className="rounded-md border border-moss-700/15 bg-white px-2.5 py-1 text-moss-700 hover:border-moss-500"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={onRequestClear}
                className="rounded-lg border border-transparent px-2 py-1 text-[12px] text-muted transition hover:border-[#c8857a]/40 hover:text-[#9a4a32]"
              >
                Clear imported data
              </button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-moss-500" />
          <div>
            <Pill tone="moss">Vagaro connected</Pill>
            <div className="mt-1 text-[12px] text-muted">Vagaro connected — updating automatically.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>
    </Card>
  );
}

function EmptyOnboardingCard({ onUpload, onPreview }: { onUpload: () => void; onPreview: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-moss-100/60 text-moss-500">
          <span className="block h-2.5 w-2.5 rounded-full border-2 border-moss-400" />
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Your numbers</div>
        <h3 className="font-display text-lg font-semibold text-moss-700">Let's get your real numbers in here</h3>
        <p className="max-w-md text-[13px] leading-relaxed text-muted">
          Export your sales from Vagaro (Reports → export to CSV) and upload it here. Takes about ten seconds, and
          your dashboard fills in right away.
        </p>
        <button
          type="button"
          onClick={onUpload}
          className="mt-1 rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600"
        >
          Upload your Vagaro export
        </button>
        <p className="max-w-md text-[12px] leading-relaxed text-muted">
          Or sit tight — once Vagaro approves our connection, your numbers will update here automatically and you
          won't need to upload anything.
        </p>
        <button type="button" onClick={onPreview} className="text-[12px] text-moss-500 underline hover:text-moss-700">
          Just want a look? Preview with sample data
        </button>
      </div>
    </Card>
  );
}

function CsvFlow({
  step,
  mapDate,
  mapAmount,
  onMapDate,
  onMapAmount,
  onConfirmMapping,
  onRetry,
}: {
  step: CsvStep;
  mapDate: string;
  mapAmount: string;
  onMapDate: (v: string) => void;
  onMapAmount: (v: string) => void;
  onConfirmMapping: () => void;
  onRetry: () => void;
}) {
  if (step.kind === "uploading") {
    return (
      <div role="status" className="rounded-xl border border-moss-700/10 bg-white px-4 py-3 text-[13px] text-muted">
        Reading your export…
      </div>
    );
  }

  if (step.kind === "needsMapping") {
    return (
      <Card className="border-champagne-300 bg-champagne-100/50">
        <p className="text-[13px] font-semibold text-champagne-600">Almost there — which columns are which?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="map-date" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Date
            </label>
            <select
              id="map-date"
              value={mapDate}
              onChange={e => onMapDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
            >
              {step.headers.map(h => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="map-amount" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Sale amount
            </label>
            <select
              id="map-amount"
              value={mapAmount}
              onChange={e => onMapAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
            >
              {step.headers.map(h => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mapDate && mapAmount && (
          <p className="mt-2 text-[12px] text-muted">
            Example from your file: {step.sampleRow[mapDate] || "—"} · {step.sampleRow[mapAmount] || "—"}
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={onConfirmMapping}
            disabled={!mapDate || !mapAmount}
            className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            Use these columns
          </button>
        </div>
      </Card>
    );
  }

  if (step.kind === "success") {
    return (
      <div role="status" className="rounded-xl border border-moss-200 bg-moss-100/50 px-4 py-3 text-[13px] text-moss-700">
        ✓ Imported {step.imported} sales · skipped {step.skipped} rows
        {step.through ? ` · through ${fmtShortDate(step.through)}` : ""}
      </div>
    );
  }

  if (step.kind === "error") {
    return (
      <div role="alert" className="rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
        <p className="font-semibold">We couldn't read that file</p>
        <p className="mt-1">Make sure it's the CSV you exported from Vagaro, then try again.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32]"
        >
          Try another file
        </button>
      </div>
    );
  }

  return null;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-moss-100/50" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-moss-100/40" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-moss-100/50" />
        ))}
      </div>
    </div>
  );
}
