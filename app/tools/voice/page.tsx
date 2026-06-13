"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";
import { defaultSystemPrompt } from "@/lib/demo/calls";

// Sage gains the ability to recommend/sell products only when the knowledge base
// actually contains retail/product info — "capability switches on with the answers."
const RETAIL_SIGNAL = /\b(retail|gift\s?cards?|product\s+line|products?\s+(we|are)\s+\w+|we\s+(carry|sell|stock|retail))\b/i;
function detectRetail(kb: string): boolean {
  return kb.trim().length > 40 && RETAIL_SIGNAL.test(kb);
}

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json"];
function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

type SaveState = "idle" | "saving" | "saved" | "error";

type CapturedMsg = {
  id: string;
  type: "message" | "booking";
  callerName: string;
  phone: string;
  service: string;
  preferredStylist: string;
  note: string;
  receivedAt: string;
};

export default function VoiceAgent() {
  const [prompt, setPrompt] = useState(defaultSystemPrompt);
  const [baseline, setBaseline] = useState(defaultSystemPrompt);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Knowledge base — what Sage answers from (fed to Retell in live mode)
  const [kb, setKb] = useState("");
  const [kbBaseline, setKbBaseline] = useState("");
  const [kbFileName, setKbFileName] = useState<string | null>(null);
  const [kbUpdatedAt, setKbUpdatedAt] = useState<string | null>(null);
  const [kbSaveState, setKbSaveState] = useState<SaveState>("idle");
  const [kbNotice, setKbNotice] = useState<string | null>(null);
  const kbFileRef = useRef<HTMLInputElement | null>(null);

  // Messages/bookings Sage captured (via the webhook → persisted)
  const [messages, setMessages] = useState<CapturedMsg[]>([]);

  useEffect(() => {
    fetch("/api/voice/prompt").then(async r => {
      if (!r.ok) return;
      const data = (await r.json()) as { prompt: string; saved: boolean };
      setPrompt(data.prompt);
      setBaseline(data.prompt);
    }).catch(() => {});

    fetch("/api/voice/knowledge").then(async r => {
      if (!r.ok) return;
      const data = (await r.json()) as { text: string; fileName: string | null; updatedAt: string | null };
      setKb(data.text);
      setKbBaseline(data.text);
      setKbFileName(data.fileName);
      setKbUpdatedAt(data.updatedAt);
    }).catch(() => {});

    fetch("/api/voice/messages").then(async r => {
      if (!r.ok) return;
      const data = (await r.json()) as { messages: CapturedMsg[] };
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    }).catch(() => {});
  }, []);

  const dirty = prompt !== baseline;
  const kbDirty = kb !== kbBaseline;
  const retailOn = detectRetail(kb);

  async function savePrompt() {
    setSaveState("saving");
    try {
      const res = await fetch("/api/voice/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      setBaseline(prompt);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2400);
    }
  }

  function onKbFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKbFileName(file.name);
    setKbNotice(null);
    if (isTextFile(file.name)) {
      const reader = new FileReader();
      reader.onload = () => setKb(String(reader.result ?? ""));
      reader.onerror = () => setKbNotice("Couldn't read that file — try pasting the text instead.");
      reader.readAsText(file);
    } else {
      setKbNotice(
        `"${file.name}" attached. PDF/Word text extraction runs in live mode — for now, paste the contents below so Sage can use it.`
      );
    }
    e.target.value = "";
  }

  async function saveKb() {
    setKbSaveState("saving");
    try {
      const res = await fetch("/api/voice/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: kb, fileName: kbFileName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { updatedAt: string | null };
      setKbBaseline(kb);
      setKbUpdatedAt(data.updatedAt);
      setKbSaveState("saved");
      setTimeout(() => setKbSaveState("idle"), 1800);
    } catch {
      setKbSaveState("error");
      setTimeout(() => setKbSaveState("idle"), 2400);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 03 · Voice</div>
        <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Front Desk Agent</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One number. Sage answers, gives info from the knowledge base, transfers to a human when needed,
          and takes a message otherwise — every call captured here.
        </p>
      </header>

      <Card>
        <CardHead
          eyebrow="Inbox"
          title="Messages & bookings Sage captured"
          action={<Pill tone={messages.length ? "moss" : "neutral"}>{messages.length} total</Pill>}
        />
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-moss-700/15 bg-cream/50 px-4 py-6 text-center text-[13px] text-muted">
            No messages yet — when Sage takes a message or booking on a call, it lands here and is emailed to you.
          </div>
        ) : (
          <ul className="divide-y divide-moss-700/8">
            {messages.slice(0, 8).map(msg => (
              <li key={msg.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Pill tone={msg.type === "booking" ? "moss" : "champagne"}>{msg.type}</Pill>
                    <span className="text-[14px] font-medium text-moss-700">{msg.callerName}</span>
                    {msg.phone && <span className="text-[12px] text-muted">· {msg.phone}</span>}
                  </div>
                  <div className="mt-1 text-[12px] text-muted">
                    {[msg.service, msg.preferredStylist].filter(Boolean).join(" · ")}
                  </div>
                  {msg.note && <div className="mt-1 text-[13px] text-ink">{msg.note}</div>}
                </div>
                <span className="shrink-0 text-[11px] text-muted">
                  {new Date(msg.receivedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EmptyState
        eyebrow="Call transcripts"
        title="No calls yet"
        description="Once Sage is answering your line, every call's full transcript will appear here to review."
      />

      <Card>
        <CardHead
          eyebrow="System prompt"
          title="How Sage answers the phone"
          action={
            <div className="flex gap-2">
              {dirty && (
                <button
                  onClick={() => setPrompt(baseline)}
                  className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-moss-700 hover:border-moss-500"
                >
                  Revert
                </button>
              )}
              <button
                onClick={savePrompt}
                disabled={!dirty || saveState === "saving"}
                className="rounded-lg bg-moss-700 px-3 py-1.5 text-[12px] text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
              >
                {saveState === "saving" ? "Saving…"
                  : saveState === "saved" ? "Saved ✓"
                  : saveState === "error" ? "Retry"
                  : dirty ? "Save changes" : "Saved ✓"}
              </button>
            </div>
          }
        />
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={12}
          className="w-full resize-none rounded-xl border border-moss-700/10 bg-cream/60 p-4 font-mono text-[12.5px] leading-relaxed text-moss-800 outline-none transition focus:border-moss-500"
        />
        <p className="mt-2 text-[11px] text-muted">
          Live mode wires this prompt + the knowledge base into Retell. Saved prompts persist.
        </p>
      </Card>

      <Card>
        <CardHead
          eyebrow="Knowledge base"
          title="What Sage knows"
          action={
            <div className="flex items-center gap-2">
              <Pill tone={retailOn ? "moss" : "neutral"}>{retailOn ? "Retail: on" : "Retail: off"}</Pill>
              {kbDirty && (
                <button
                  onClick={() => { setKb(kbBaseline); setKbNotice(null); }}
                  className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-moss-700 hover:border-moss-500"
                >
                  Revert
                </button>
              )}
              <button
                onClick={saveKb}
                disabled={!kbDirty || kbSaveState === "saving"}
                className="rounded-lg bg-moss-700 px-3 py-1.5 text-[12px] text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
              >
                {kbSaveState === "saving" ? "Saving…"
                  : kbSaveState === "saved" ? "Saved ✓"
                  : kbSaveState === "error" ? "Retry"
                  : kbDirty ? "Save knowledge" : "Saved ✓"}
              </button>
            </div>
          }
        />
        <p className="mb-3 text-[12px] text-muted">
          Upload the salon's filled-in intake (or paste it). This is the source of truth Sage answers
          callers from — hours, services, policies, FAQs, and more.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input ref={kbFileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,.doc" hidden onChange={onKbFile} />
          <button
            onClick={() => kbFileRef.current?.click()}
            className="rounded-lg border border-dashed border-moss-700/25 bg-white/70 px-4 py-2 text-[13px] font-medium text-moss-700 transition hover:border-moss-400"
          >
            ↑ Upload a file
          </button>
          <span className="text-[12px] text-muted">
            {kbFileName ? <>Source: <b className="text-moss-700">{kbFileName}</b></> : "— or paste below — .txt, .md, .csv accepted (PDF/Word in live mode)"}
          </span>
        </div>

        {kbNotice && (
          <div className="mb-3 rounded-lg border border-champagne-400/40 bg-champagne-100/40 px-3 py-2 text-[12px] text-moss-700">
            {kbNotice}
          </div>
        )}

        <textarea
          value={kb}
          onChange={e => { setKb(e.target.value); setKbNotice(null); }}
          rows={12}
          placeholder="Paste the salon's knowledge base here — or upload a file above.&#10;&#10;Tip: the more you include about products you carry and gift cards, the more Sage can help with retail."
          className="w-full resize-none rounded-xl border border-moss-700/10 bg-cream/60 p-4 text-[13px] leading-relaxed text-moss-800 outline-none transition placeholder:text-muted/70 focus:border-moss-500"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
          <span>
            {kb.trim().length === 0
              ? "Empty — Sage will fall back to the system prompt only."
              : `${kb.length.toLocaleString()} characters`}
            {kbUpdatedAt && !kbDirty && kb.trim().length > 0 && " · saved"}
          </span>
          <span>
            {retailOn
              ? "Retail info detected — Sage can recommend products & gift cards."
              : "No retail info yet — add products/gift cards to switch on retail answers."}
          </span>
        </div>
      </Card>
    </div>
  );
}
