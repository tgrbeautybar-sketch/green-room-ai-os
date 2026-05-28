"use client";

import { useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { Avatar } from "@/components/ui/Avatar";
import { callScripts, defaultSystemPrompt } from "@/lib/demo/calls";
import { stylists } from "@/lib/demo/stylists";

const OUTCOME_TONE: Record<string, "moss" | "champagne" | "rose" | "neutral"> = {
  booked: "moss",
  transferred: "champagne",
  left_message: "neutral",
  answered: "champagne",
};

export default function VoiceAgent() {
  const [selectedId, setSelectedId] = useState(callScripts[0].id);
  const [prompt, setPrompt] = useState(defaultSystemPrompt);
  const [promptDirty, setPromptDirty] = useState(false);

  const selected = callScripts.find(c => c.id === selectedId)!;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 03 · Voice</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Front Desk Agent</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            One number. Caller says who they want — Sage looks up that stylist's calendar, quotes price,
            and either books, warm-transfers, or sends a booking link. Every call captured.
          </p>
        </div>
        <Illustrative />
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Calls today"      value={String(callScripts.length)} />
        <Stat label="Booked"           value={String(callScripts.filter(c => c.outcome === "booked").length)} />
        <Stat label="Transferred"      value={String(callScripts.filter(c => c.outcome === "transferred").length)} />
        <Stat label="Avg duration"     value={`${Math.round(callScripts.reduce((a,c)=>a+c.durationSec,0)/callScripts.length)}s`} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHead eyebrow="Today's call log" title="Replay any call" />
          <ul className="space-y-2">
            {callScripts.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={[
                    "w-full rounded-xl border p-3 text-left transition",
                    c.id === selectedId
                      ? "border-moss-500 bg-moss-100/30"
                      : "border-moss-700/8 bg-white hover:border-moss-300",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-moss-700">{c.scenario}</div>
                    <Pill tone={OUTCOME_TONE[c.outcome]}>{c.outcome.replace("_", " ")}</Pill>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{c.callerName} · {c.durationSec}s · {c.turns.length} turns</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHead
            eyebrow={`Replay · ${selected.durationSec}s`}
            title={selected.scenario}
            action={<Pill tone={OUTCOME_TONE[selected.outcome]}>{selected.outcome.replace("_", " ")}</Pill>}
          />
          <div className="space-y-3">
            {selected.turns.map((t, i) => {
              const isAgent = t.speaker === "Agent";
              return (
                <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                  <div className={[
                    "max-w-[78%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
                    isAgent
                      ? "bg-moss-100/60 text-moss-800"
                      : "bg-moss-700 text-cream",
                  ].join(" ")}>
                    <div className={[
                      "mb-0.5 text-[10px] font-medium uppercase tracking-[0.14em]",
                      isAgent ? "text-moss-500" : "text-champagne-200",
                    ].join(" ")}>
                      {isAgent ? "Sage · Agent" : selected.callerName}
                    </div>
                    {t.text}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <Card>
        <CardHead
          eyebrow="System prompt"
          title="How Sage answers the phone"
          action={
            <div className="flex gap-2">
              {promptDirty && (
                <button
                  onClick={() => { setPrompt(defaultSystemPrompt); setPromptDirty(false); }}
                  className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-moss-700 hover:border-moss-500"
                >
                  Revert
                </button>
              )}
              <button
                disabled={!promptDirty}
                className="rounded-lg bg-moss-700 px-3 py-1.5 text-[12px] text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
              >
                {promptDirty ? "Save changes" : "Saved ✓"}
              </button>
            </div>
          }
        />
        <textarea
          value={prompt}
          onChange={e => { setPrompt(e.target.value); setPromptDirty(true); }}
          rows={12}
          className="w-full resize-none rounded-xl border border-moss-700/10 bg-cream/60 p-4 font-mono text-[12.5px] leading-relaxed text-moss-800 outline-none transition focus:border-moss-500"
        />
        <p className="mt-2 text-[11px] text-muted">
          Live mode wires this prompt + the 12-stylist roster into Retell. Demo mode plays the scripted
          calls above.
        </p>
      </Card>

      <Card>
        <CardHead eyebrow="Routing logic" title="Stylist roster" />
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stylists.map(s => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-moss-700/8 bg-white p-3">
              <Avatar initials={s.initials} hueDeg={s.hueDeg} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-moss-700">{s.name}</div>
                <div className="text-[11px] text-muted">{s.role} · {s.chair} · {s.bookingSystem}</div>
              </div>
              <Pill tone="neutral">{s.handle.replace("@", "")}</Pill>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-moss-700">{value}</div>
    </Card>
  );
}
