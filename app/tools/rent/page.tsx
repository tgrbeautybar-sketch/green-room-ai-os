"use client";

import { useEffect, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

type RentType = "chair" | "room";
type RentEntry = { id: string; name: string; type: RentType; amount: number; status: "paid" | "unpaid"; note?: string; email?: string; phone?: string };

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

export default function RentRollPage() {
  const [entries, setEntries] = useState<RentEntry[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [emailStatus, setEmailStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);

  // Add form
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<RentType>("chair");
  const [addAmount, setAddAmount] = useState<number>(200);

  useEffect(() => {
    fetch("/api/rent/roster").then(async r => {
      if (!r.ok) return;
      const d = (await r.json()) as { entries: RentEntry[] };
      const es = Array.isArray(d.entries) ? d.entries : [];
      setEntries(es);
      setBaseline(JSON.stringify(es));
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  // Auto-save: persist a moment after you stop editing (no Save button needed).
  useEffect(() => {
    if (!loaded) return;
    if (JSON.stringify(entries) === baseline) return;
    const t = setTimeout(() => { save(); }, 800);
    return () => clearTimeout(t);
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

  async function save() {
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
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2400);
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
              {saveState === "saving" || dirty ? "Saving…" : "All changes saved ✓"}
            </span>
          )}
        </div>
      </header>

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
