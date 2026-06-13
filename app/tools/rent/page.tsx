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

export default function RentRollPage() {
  const [entries, setEntries] = useState<RentEntry[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState<string | null>(null);

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
    }).catch(() => {});
  }, []);

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
    setSaveState("saving");
    try {
      const res = await fetch("/api/rent/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as { entries: RentEntry[] };
      setEntries(d.entries);
      setBaseline(JSON.stringify(d.entries));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2400);
    }
  }

  function copyReminder(e: RentEntry) {
    navigator.clipboard?.writeText(reminderText(e)).then(() => {
      setCopied(e.id);
      setTimeout(() => setCopied(null), 1600);
    }).catch(() => {});
  }

  function mailtoHref(e: RentEntry) {
    const subject = encodeURIComponent("Rent reminder — The Green Room");
    const body = encodeURIComponent(reminderText(e));
    return `mailto:${e.email ?? ""}?subject=${subject}&body=${body}`;
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
          {dirty && (
            <button
              onClick={() => { try { setEntries(JSON.parse(baseline)); } catch { /* noop */ } }}
              className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-moss-700 hover:border-moss-500"
            >
              Discard
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saveState === "saving"}
            className="rounded-lg bg-moss-700 px-4 py-1.5 text-[12px] font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            {saveState === "saving" ? "Saving…"
              : saveState === "saved" ? "Saved ✓"
              : saveState === "error" ? "Retry"
              : dirty ? "Save changes" : "Saved ✓"}
          </button>
        </div>
      </header>

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
                      {e.email ? (
                        <a
                          href={mailtoHref(e)}
                          className="rounded-md border border-moss-700/15 bg-white px-2.5 py-1 text-[12px] font-medium text-moss-700 transition hover:border-moss-500"
                        >
                          ✉ Email reminder
                        </a>
                      ) : (
                        <span className="text-[12px] text-muted">Add an email above to send a reminder</span>
                      )}
                      <button
                        onClick={() => copyReminder(e)}
                        className="rounded-md border border-moss-700/15 bg-white px-2.5 py-1 text-[12px] text-moss-700 transition hover:border-moss-500"
                      >
                        {copied === e.id ? "Copied ✓" : "Copy text"}
                      </button>
                    </div>
                  )}

                  {e.note && <div className="mt-1 pl-9 text-[12px] text-champagne-600">{e.note}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted">
          Add each renter's email/phone to send reminders. <b className="text-moss-700">Email reminder</b> opens your
          email pre-filled to send; <b className="text-moss-700">Copy text</b> copies a message for your phone.
          Remember to <b className="text-moss-700">Save changes</b> after editing.
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
