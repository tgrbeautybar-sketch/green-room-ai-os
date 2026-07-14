"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

type RentType = "chair" | "room";
type RentEntry = {
  id: string;
  name: string;
  type: RentType;
  amount: number;
  status: "paid" | "unpaid";
  note?: string;
  email?: string;
  phone?: string;
  venmoName?: string;
};

function reminderText(e: RentEntry) {
  const first = e.name.split(" ")[0] || e.name || "there";
  return `Hi ${first}! Friendly reminder that your ${e.type} rent of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(e.amount)} is due. Thank you so much! — Belinda`;
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function newId() {
  return `r_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

type VenmoMatch = {
  renterId: string;
  renterName: string;
  type: string;
  rentAmount: number;
  detected: number;
  count: number;
  payers: string[];
  enough: boolean;
  alreadyPaid: boolean;
};
type Unmatched = { payer: string; amount: number; date: string };
type CheckResult = { enabled: boolean; error?: string; matches: VenmoMatch[]; unmatched?: Unmatched[] };

// Mirrors lib/rent-cycle.ts's LastRun — kept as a local type (not imported)
// since that module transitively pulls in lib/store.ts's "server-only" guard,
// and this page is a client component. Keep the two in sync if either changes.
type CyclePhase = "friday" | "monday";
type LastRun = {
  at: string;
  phase: CyclePhase;
  reminded: number;
  manuallyPaid: number;
  detectedPaid: number;
  partial: number;
  needsText: number;
  sendFailed: number;
  scanOk: boolean;
  error?: string;
  automationOn: boolean;
  sendMode: "live" | "disabled";
};
type AutomationResponse = { autoRemind: boolean; lastRun: LastRun | null };

export default function RentRollPage() {
  const [entries, setEntries] = useState<RentEntry[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [emailStatus, setEmailStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);

  // "Start a new week" reset: flips everyone to unpaid + stamps a week marker.
  const [weekStartedAt, setWeekStartedAt] = useState<string | null>(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [resetDone, setResetDone] = useState(false); // transient, auto-clears

  // Tracks the pending debounced auto-save timer so "Start new week" can flush
  // it before resetting — otherwise a stale debounced save could re-write the
  // pre-reset roster on top of the fresh one.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add form
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<RentType>("chair");
  const [addAmount, setAddAmount] = useState<number>(200);

  useEffect(() => {
    fetch("/api/rent/roster").then(async r => {
      if (!r.ok) return;
      const d = (await r.json()) as { entries: RentEntry[]; weekStartedAt?: string | null };
      const es = Array.isArray(d.entries) ? d.entries : [];
      setEntries(es);
      setBaseline(JSON.stringify(es));
      setWeekStartedAt(d.weekStartedAt ?? null);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // Auto-save: persist a moment after you stop editing (no Save button needed).
  // The pending timer is mirrored into saveTimerRef so startNewWeek can flush it.
  useEffect(() => {
    if (!loaded) return;
    if (JSON.stringify(entries) === baseline) return;
    const t = setTimeout(() => { save(); }, 800);
    saveTimerRef.current = t;
    return () => {
      clearTimeout(t);
      if (saveTimerRef.current === t) saveTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, loaded, baseline]);

  const dirty = JSON.stringify(entries) !== baseline;
  const expected = entries.reduce((a, e) => a + e.amount, 0);
  const collected = entries.filter(e => e.status === "paid").reduce((a, e) => a + e.amount, 0);
  const paidCount = entries.filter(e => e.status === "paid").length;
  const outstanding = expected - collected;

  function update(id: string, patch: Partial<RentEntry>) {
    setEntries(es => es.map(e => (e.id === id ? { ...e, ...patch } : e)));
  }
  function remove(id: string) {
    setEntries(es => es.filter(e => e.id !== id));
  }
  function addEntry() {
    if (!addName.trim()) return;
    setEntries(es => [...es, { id: newId(), name: addName.trim(), type: addType, amount: addAmount || 0, status: "unpaid" }]);
    setAddName("");
    setAddAmount(addType === "room" ? 250 : 200);
  }

  // Returns true if the write landed, false if it failed. Still drives saveState
  // as before — callers that need to gate on the outcome (e.g. the pre-reset
  // flush in startNewWeek) read the boolean; the auto-save effect ignores it.
  async function save(): Promise<boolean> {
    // Snapshot what we send; don't overwrite local state on return (avoids clobbering in-flight edits during auto-save).
    const snapshot = JSON.stringify(entries);
    setSaveState("saving");
    try {
      const res = await fetch("/api/rent/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error(await res.text());
      setBaseline(snapshot);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2400);
      return false;
    }
  }

  async function checkPayments() {
    setChecking(true);
    try {
      const res = await fetch("/api/rent/check-payments");
      const d = (await res.json()) as CheckResult;
      setCheck(d);
    } catch {
      setCheck({ enabled: true, error: "Couldn't check payments — try again.", matches: [] });
    } finally {
      setChecking(false);
    }
  }

  // "Start a new week": reset every renter to unpaid and stamp a fresh week
  // marker. Flush any pending auto-save FIRST so the reset acts on the latest
  // on-screen roster and no stale debounced write lands on top of the reset.
  async function startNewWeek() {
    setResetting(true);
    setResetError(false);
    try {
      // Cancel the debounced auto-save timer, then flush the pending edits so
      // the server's roster matches what's on screen before we reset it.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // The flush MUST land before we reset. save() swallows its own errors and
      // reports the outcome as a boolean — if the flush failed, abort: resetting
      // against a stale server roster would wipe the unsaved edit while showing
      // a success chip. On a flush failure the reset POST never fires, so the
      // accurate signal is save()'s own "Save failed — retry" state; we do NOT
      // raise the reset alert here (it would say "couldn't start a new week"
      // when the real problem is the unsaved edit) — that would double up two
      // conflicting retry affordances. Just close the confirm bar and stop.
      if (dirty) {
        const flushed = await save();
        if (!flushed) {
          setResetConfirming(false);
          return;
        }
      }

      const res = await fetch("/api/rent/new-week", { method: "POST" });
      const d = (await res.json()) as { ok: boolean; entries?: RentEntry[]; weekStartedAt?: string | null };
      if (!res.ok || !d.ok || !Array.isArray(d.entries)) throw new Error("reset failed");

      // Land entries + baseline together so the auto-save effect sees them
      // equal and doesn't immediately re-fire, and Stats/Pills recompute in
      // one render (Collected → $0, Outstanding → full, % → 0).
      setEntries(d.entries);
      setBaseline(JSON.stringify(d.entries));
      setWeekStartedAt(d.weekStartedAt ?? null);
      setResetConfirming(false);
      setResetDone(true);
      setTimeout(() => setResetDone(false), 2000);
    } catch {
      // Close the confirm bar so only the error alert's single "Try again"
      // remains — no duplicate retry affordance (bar button + alert button).
      setResetConfirming(false);
      setResetError(true);
    } finally {
      setResetting(false);
    }
  }

  function mailtoHref(e: RentEntry) {
    const subject = encodeURIComponent("Rent reminder — The Green Room");
    const body = encodeURIComponent(reminderText(e));
    return `mailto:${e.email ?? ""}?subject=${subject}&body=${body}`;
  }

  // Opens the phone's Messages app pre-filled — Belinda sends it herself (no A2P needed).
  function smsHref(e: RentEntry) {
    const phone = (e.phone ?? "").replace(/[^\d+]/g, "");
    return `sms:${phone}?&body=${encodeURIComponent(reminderText(e))}`;
  }

  // System sends the reminder from Belinda's Gmail (verified working).
  async function sendEmailReminder(e: RentEntry) {
    if (!e.email) return;
    setEmailStatus(s => ({ ...s, [e.id]: "sending" }));
    try {
      const res = await fetch("/api/rent/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: e.email, name: e.name, type: e.type, amount: e.amount }),
      });
      const d = (await res.json()) as { mode?: string };
      setEmailStatus(s => ({ ...s, [e.id]: res.ok && d.mode === "live" ? "sent" : "error" }));
    } catch {
      setEmailStatus(s => ({ ...s, [e.id]: "error" }));
    }
    setTimeout(() => setEmailStatus(s => ({ ...s, [e.id]: "idle" })), 3500);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 04 · Cash</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Rent Roll</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your chair and room renters. Mark who's paid, follow up with whoever hasn't, and add or remove
            stylists as they come and go.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={checkPayments}
            disabled={checking}
            className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
          >
            {checking ? "Checking…" : "↻ Check Venmo payments"}
          </button>
          <button
            type="button"
            onClick={() => { setResetError(false); setResetConfirming(true); }}
            disabled={resetting || resetConfirming}
            aria-expanded={resetConfirming}
            aria-controls="new-week-confirm"
            className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
          >
            Start new week
          </button>
          {dirty && (
            <button
              onClick={() => { try { setEntries(JSON.parse(baseline)); } catch { /* noop */ } }}
              className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-moss-700 hover:border-moss-500"
            >
              Discard
            </button>
          )}
          {saveState === "error" ? (
            <button
              onClick={save}
              className="rounded-lg bg-[#9a4a32] px-4 py-1.5 text-[12px] font-medium text-cream shadow-sm hover:opacity-90"
            >
              Save failed — retry
            </button>
          ) : (
            <span className="rounded-lg border border-moss-700/10 bg-white px-3 py-1.5 text-[12px] text-muted">
              {resetDone
                ? "New week started ✓"
                : saveState === "saving" || dirty
                ? "Saving…"
                : "All changes saved ✓"}
            </span>
          )}
        </div>
      </header>

      {resetConfirming && (
        <div
          id="new-week-confirm"
          role="group"
          aria-label="Start a new rent week"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-moss-700/12 bg-cream/60 px-4 py-3"
        >
          <span className="min-w-[16rem] grow text-[13px] leading-relaxed text-moss-700">
            Start a new rent week? This marks everyone unpaid so you&apos;re tracking this week fresh. Names, amounts and contacts all stay.
          </span>
          <button
            type="button"
            onClick={startNewWeek}
            disabled={resetting}
            className="rounded-lg bg-moss-700 px-4 py-2 text-[13px] font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            {resetting ? "Starting…" : "Start new week"}
          </button>
          <button
            type="button"
            onClick={() => { setResetConfirming(false); setResetError(false); }}
            disabled={resetting}
            className="text-[13px] text-muted transition hover:text-moss-700 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}

      {resetError && (
        <div
          role="alert"
          className="rounded-lg border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]"
        >
          <p>Couldn&apos;t start a new week just now. Please try again.</p>
          <button
            type="button"
            onClick={startNewWeek}
            disabled={resetting}
            className="mt-2 rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32] disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      <AutoRemindCard />

      {check && (
        <Card>
          <CardHead
            eyebrow="Venmo check"
            title="Detected payments"
            action={
              <button
                onClick={() => setCheck(null)}
                className="rounded-md border border-moss-700/15 bg-white px-2.5 py-1 text-[12px] text-muted hover:border-moss-500"
              >
                Dismiss
              </button>
            }
          />
          {!check.enabled ? (
            <p className="text-[13px] text-muted">Connect Belinda's Gmail to detect Venmo payments.</p>
          ) : check.error ? (
            <p className="text-[13px] text-[#9a4a32]">{check.error}</p>
          ) : check.matches.length === 0 && (check.unmatched?.length ?? 0) === 0 ? (
            <p className="text-[13px] text-muted">No Venmo payments found.</p>
          ) : (
            <>
              <ul className="divide-y divide-moss-700/8">
                {check.matches.map(m => {
                  const live = entries.find(e => e.id === m.renterId);
                  const isPaid = live?.status === "paid";
                  return (
                    <li key={m.renterId} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                      <span className="font-medium text-moss-700">{m.renterName}</span>
                      <span className="text-muted">
                        {fmtUSD(m.detected)} detected{m.count > 1 ? ` (${m.count} payments)` : ""}
                        {m.payers.length ? ` · ${m.payers.join(", ")}` : ""}
                      </span>
                      {isPaid ? (
                        <Pill tone="moss">paid ✓</Pill>
                      ) : m.enough ? (
                        <button
                          onClick={() => update(m.renterId, { status: "paid" })}
                          className="rounded-md bg-moss-700 px-2.5 py-1 text-[12px] font-medium text-cream hover:bg-moss-600"
                        >
                          Mark paid ✓
                        </button>
                      ) : (
                        <Pill tone="champagne">partial · {fmtUSD(m.detected)} of {fmtUSD(m.rentAmount)}</Pill>
                      )}
                    </li>
                  );
                })}
              </ul>
              {check.unmatched && check.unmatched.length > 0 && (
                <div className="mt-2 rounded-lg border border-dashed border-moss-700/15 bg-cream/40 px-3 py-2 text-[12px] text-muted">
                  Not matched to a renter: {check.unmatched.map(u => `${u.payer} ${fmtUSD(u.amount)}`).join(" · ")}
                </div>
              )}
            </>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Reads Venmo emails (incl. Trash &amp; Spam), sums each person's payments, and remembers them even if you delete the email. Bank transfers are ignored. Marking paid saves automatically.
          </p>
        </Card>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Expected" value={fmtUSD(expected)} sub={`${entries.length} renters`} />
        <Stat label="Collected" value={fmtUSD(collected)} sub={`${paidCount} paid`} />
        <Stat label="Outstanding" value={fmtUSD(outstanding)} sub={`${entries.length - paidCount} to follow up`} />
        <Stat label="Collected %" value={`${expected ? Math.round((collected / expected) * 100) : 0}%`} />
      </section>

      <Card>
        <CardHead eyebrow="Add a renter" title="New chair or room" />
        <div className="flex flex-wrap items-end gap-2">
          <div className="grow">
            <label className="block text-[11px] uppercase tracking-[0.14em] text-muted">Name</label>
            <input
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addEntry(); }}
              placeholder="Stylist name"
              className="mt-1 w-full rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-muted">Type</label>
            <select
              value={addType}
              onChange={e => { const t = e.target.value as RentType; setAddType(t); setAddAmount(t === "room" ? 250 : 200); }}
              className="mt-1 rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
            >
              <option value="chair">Chair</option>
              <option value="room">Room</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-muted">Rent ($)</label>
            <input
              type="number"
              value={addAmount}
              onChange={e => setAddAmount(parseInt(e.target.value) || 0)}
              className="mt-1 w-24 rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
            />
          </div>
          <button
            onClick={addEntry}
            disabled={!addName.trim()}
            className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            + Add
          </button>
        </div>
      </Card>

      <Card>
        <CardHead eyebrow="Roster" title={`${entries.length} renters`} />
        {weekStartedAt && formatWeekStarted(weekStartedAt) && (
          <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-muted">
            Rent week started {formatWeekStarted(weekStartedAt)}
          </p>
        )}
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-moss-700/15 bg-cream/50 px-4 py-8 text-center text-[13px] text-muted">
            No renters yet — add your chairs and rooms above.
          </div>
        ) : (
          <ul className="divide-y divide-moss-700/8">
            {entries.map(e => {
              const paid = e.status === "paid";
              return (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => update(e.id, { status: paid ? "unpaid" : "paid" })}
                      title={paid ? "Mark unpaid" : "Mark paid"}
                      className={[
                        "grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[12px] transition",
                        paid ? "border-moss-500 bg-moss-500 text-cream" : "border-moss-700/25 bg-white text-transparent hover:border-moss-400",
                      ].join(" ")}
                    >
                      ✓
                    </button>

                    <input
                      value={e.name}
                      onChange={ev => update(e.id, { name: ev.target.value })}
                      className="min-w-[8rem] grow rounded-md border border-transparent bg-transparent px-1 py-1 text-[14px] font-medium text-moss-700 outline-none hover:border-moss-700/10 focus:border-moss-500 focus:bg-white"
                    />

                    <select
                      value={e.type}
                      onChange={ev => update(e.id, { type: ev.target.value as RentType })}
                      className="rounded-md border border-moss-700/15 bg-white px-2 py-1 text-[12px] text-moss-700 outline-none focus:border-moss-500"
                    >
                      <option value="chair">chair</option>
                      <option value="room">room</option>
                    </select>

                    <div className="flex items-center gap-1 text-[14px] text-moss-700">
                      <span className="text-muted">$</span>
                      <input
                        type="number"
                        value={e.amount}
                        onChange={ev => update(e.id, { amount: parseInt(ev.target.value) || 0 })}
                        className="w-20 rounded-md border border-moss-700/15 bg-white px-2 py-1 text-right text-[14px] font-semibold outline-none focus:border-moss-500"
                      />
                    </div>

                    <Pill tone={paid ? "moss" : "neutral"}>{paid ? "paid" : "unpaid"}</Pill>

                    <button
                      onClick={() => remove(e.id)}
                      title="Remove"
                      className="ml-auto rounded-md border border-transparent px-2 py-1 text-[14px] text-muted transition hover:border-[#c8857a]/40 hover:text-[#9a4a32]"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                    <input
                      value={e.email ?? ""}
                      onChange={ev => update(e.id, { email: ev.target.value })}
                      placeholder="email — for reminders"
                      className="min-w-[12rem] grow rounded-md border border-moss-700/12 bg-white px-2 py-1 text-[12px] text-moss-700 outline-none focus:border-moss-500"
                    />
                    <input
                      value={e.phone ?? ""}
                      onChange={ev => update(e.id, { phone: ev.target.value })}
                      placeholder="phone — for texts"
                      className="w-40 rounded-md border border-moss-700/12 bg-white px-2 py-1 text-[12px] text-moss-700 outline-none focus:border-moss-500"
                    />
                    <input
                      value={e.venmoName ?? ""}
                      onChange={ev => update(e.id, { venmoName: ev.target.value })}
                      placeholder="Venmo name (if different)"
                      className="w-48 rounded-md border border-moss-700/12 bg-white px-2 py-1 text-[12px] text-moss-700 outline-none focus:border-moss-500"
                    />
                  </div>

                  {!paid && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                      {e.phone && (
                        <a
                          href={smsHref(e)}
                          className="rounded-md border border-moss-700/15 bg-white px-2.5 py-1 text-[12px] font-medium text-moss-700 transition hover:border-moss-500"
                        >
                          📱 Text reminder
                        </a>
                      )}
                      {e.email && (
                        <>
                          <button
                            onClick={() => sendEmailReminder(e)}
                            disabled={emailStatus[e.id] === "sending"}
                            className="rounded-md border border-moss-700/15 bg-white px-2.5 py-1 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
                          >
                            {emailStatus[e.id] === "sending" ? "Sending…"
                              : emailStatus[e.id] === "sent" ? "Sent ✓"
                              : emailStatus[e.id] === "error" ? "Failed — try again"
                              : "✉ Email reminder"}
                          </button>
                          <a href={mailtoHref(e)} className="text-[12px] text-moss-500 underline hover:text-moss-700">
                            or open in my email
                          </a>
                        </>
                      )}
                      {!e.phone && !e.email && (
                        <span className="text-[12px] text-muted">Add an email or phone above to send a reminder</span>
                      )}
                    </div>
                  )}

                  {e.note && <div className="mt-1 pl-9 text-[12px] text-champagne-600">{e.note}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted">
          Add a <b className="text-moss-700">phone</b> for a text reminder, or an <b className="text-moss-700">email</b> for an email reminder.
          <b className="text-moss-700"> Text reminder</b> opens Messages on your phone to send. <b className="text-moss-700">Email reminder</b> sends automatically from your Gmail in one click.
          Changes <b className="text-moss-700">save automatically</b>.
        </p>
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

// ---------- Auto-remind card ----------

// "Jul 17" — NY-time month + day the current rent week was started. Returns
// null on an invalid/blank timestamp so the caller renders nothing rather than
// "Invalid Date".
function formatWeekStarted(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(d);
}

function formatRunTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const meridiem = get("dayPeriod").toLowerCase().replace(/[.\s]/g, "");
  if (!weekday || !month || !day || !hour || !minute || !meridiem) return null;
  return `${weekday} ${month} ${day}, ${hour}:${minute}${meridiem}`;
}

function autoRemindStatusLine(autoRemind: boolean, lastRun: LastRun | null): { tone: "muted" | "warn"; text: string } | null {
  // (A) Never run with automation on, or the toggle wasn't on for the last recorded run.
  if (!lastRun || lastRun.automationOn === false) {
    if (!autoRemind) return null;
    return { tone: "muted", text: "Hasn't run yet — first run is next Friday morning." };
  }

  // (B1) Email sending isn't configured at all — nothing could have gone out.
  if (lastRun.sendMode === "disabled") {
    return { tone: "muted", text: "Email sending isn't set up yet, so reminders can't go out." };
  }

  // (B2) The Venmo scan itself failed last run — no reminders were attempted.
  if (lastRun.scanOk === false) {
    return {
      tone: "warn",
      text: "Couldn't check Venmo payments last run — no reminders were sent. You can remind manually below.",
    };
  }

  // (B3) A normal completed run — summarize counts, dropping any that are zero.
  const segments: string[] = [];
  if (lastRun.reminded > 0) segments.push(`${lastRun.reminded} reminded`);
  const alreadyPaid = lastRun.detectedPaid + lastRun.manuallyPaid;
  if (alreadyPaid > 0) segments.push(`${alreadyPaid} already paid`);
  if (lastRun.partial > 0) segments.push(`${lastRun.partial} paid partially`);
  if (lastRun.needsText > 0) segments.push(`${lastRun.needsText} needs a text`);
  // Sends can fail even when the Venmo scan itself succeeded (e.g. lapsed
  // Gmail creds) — surface that count so a run where every send failed never
  // reads as a quiet success.
  if (lastRun.sendFailed > 0) segments.push(`${lastRun.sendFailed} couldn't send`);

  const timeStr = formatRunTime(lastRun.at);
  const prefix = timeStr ? `Auto-reminders ran ${timeStr}` : "Auto-reminders ran";
  const tail = segments.length > 0 ? segments.join(", ") : "everyone was already paid.";
  const text = segments.length > 0 ? `${prefix} — ${tail}.` : `${prefix} — ${tail}`;
  return { tone: lastRun.sendFailed > 0 ? "warn" : "muted", text };
}

function AutoRemindCard() {
  const [autoRemind, setAutoRemind] = useState(false);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    fetch("/api/rent/automation")
      .then(async r => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        const d = (await r.json()) as AutomationResponse;
        setAutoRemind(!!d.autoRemind);
        setLastRun(d.lastRun ?? null);
      })
      .catch(() => {
        // Never crash the page over this — just render as OFF, same as a brand-new install.
        setAutoRemind(false);
        setLastRun(null);
      })
      .finally(() => setAutoLoaded(true));
  }, []);

  async function persistAutomation(value: boolean) {
    setPendingValue(value);
    setSavingAuto(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/rent/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRemind: value }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = (await res.json()) as AutomationResponse;
      setAutoRemind(!!d.autoRemind);
      setLastRun(d.lastRun ?? null);
      setConfirming(false);
      setPendingValue(null);
    } catch {
      setSaveError(true);
    } finally {
      setSavingAuto(false);
    }
  }

  function onToggleClick() {
    if (autoRemind) {
      // Turning off needs no confirmation — it's the safe direction.
      persistAutomation(false);
    } else {
      // Turning on is confirm-then-flip: the switch itself stays OFF until confirmed.
      setSaveError(false);
      setConfirming(true);
    }
  }

  if (!autoLoaded) return <AutoRemindCardSkeleton />;

  const statusLine = autoRemindStatusLine(autoRemind, lastRun);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[16rem] grow">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-moss-700">Auto-remind unpaid renters</h3>
            <Pill tone={autoRemind ? "moss" : "neutral"}>{autoRemind ? "On" : "Off"}</Pill>
          </div>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
            Automatically email unpaid renters Friday &amp; Monday mornings from your Gmail.
          </p>
          {statusLine && (
            statusLine.tone === "warn" ? (
              <p className="mt-1 text-[13px] leading-relaxed text-[#9a4a32]">
                <span aria-hidden="true">⚠ </span>
                {statusLine.text}
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{statusLine.text}</p>
            )
          )}
        </div>

        <div className="flex items-center gap-3">
          {savingAuto && <span className="text-[11px] text-muted">Saving…</span>}
          <button
            type="button"
            role="switch"
            aria-checked={autoRemind}
            aria-label="Auto-remind unpaid renters"
            onClick={onToggleClick}
            disabled={savingAuto}
            className={[
              "relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 disabled:opacity-60",
              autoRemind ? "bg-moss-600" : "bg-moss-200",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                autoRemind ? "left-5" : "left-0.5",
              ].join(" ")}
            />
          </button>
        </div>
      </div>

      {confirming && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-moss-700/12 bg-cream/60 px-4 py-3">
          <span className="text-[13px] text-moss-700">
            This will email your unpaid renters every Friday &amp; Monday morning.
          </span>
          <button
            type="button"
            onClick={() => persistAutomation(true)}
            disabled={savingAuto}
            className="rounded-lg bg-moss-700 px-4 py-2 text-[13px] font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            {savingAuto ? "Turning on…" : "Turn on"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setSaveError(false);
            }}
            disabled={savingAuto}
            className="text-[13px] text-muted transition hover:text-moss-700 disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]"
        >
          <p>Couldn't save that just now — your renters weren't affected. Please try again.</p>
          <button
            type="button"
            onClick={() => {
              if (pendingValue !== null) persistAutomation(pendingValue);
            }}
            className="mt-2 rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32]"
          >
            Try again
          </button>
        </div>
      )}
    </Card>
  );
}

function AutoRemindCardSkeleton() {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[16rem] grow space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-48 animate-pulse rounded bg-moss-100/70" />
            <div className="h-4 w-10 animate-pulse rounded-full bg-moss-100/70" />
          </div>
          <div className="h-3.5 w-72 animate-pulse rounded bg-moss-100/50" />
        </div>
        <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-moss-100/70" />
      </div>
    </Card>
  );
}
