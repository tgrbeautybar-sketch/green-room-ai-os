"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import type { RetellCall } from "@/lib/retell";
import type { CapturedMessage } from "@/lib/store";

type CallsData = { enabled: boolean; error?: string; calls: RetellCall[] };

const NY_TZ = "America/New_York";
const MAX_ROWS = 30;

// ---------- helpers (module scope) ----------

// (978) 315-6954-style formatting, tolerant of whatever Retell hands back.
function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "Unknown caller";
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return raw || "Unknown caller";
}

// Fixed-timezone Intl formatters used by relativeCallTime — constant for the
// life of the module, so build once instead of on every call/render.
const CALL_DAY_FMT = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const CALL_TIME_FMT = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, hour: "numeric", minute: "2-digit", hour12: true });
const CALL_WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  weekday: "short", month: "short", day: "numeric",
});

// "Today 2:14 PM" / "Yesterday 4:30 PM" / "Mon Jul 7, 11:02 AM" — always as New
// York wall-clock time via Intl, never a naive Date#toLocaleString.
function relativeCallTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const dateKey = (d: Date) => CALL_DAY_FMT.format(d);

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const time = CALL_TIME_FMT.format(date);

  if (dateKey(date) === dateKey(now)) return `Today ${time}`;
  if (dateKey(date) === dateKey(yesterday)) return `Yesterday ${time}`;

  const parts = CALL_WEEKDAY_FMT.formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")}, ${time}`;
}

// "3m 12s" / "45s" — omitted entirely when the call has no measurable duration.
function formatDuration(sec: number | null): string | null {
  if (sec == null || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type TranscriptLine = { speaker: "agent" | "caller"; text: string };

// Splits Retell's plain-text transcript into speaker-attributed lines. Lines
// missing a prefix continue the previous speaker's turn (or open as the
// caller if there's no previous turn yet).
function parseTranscript(transcript: string | null): TranscriptLine[] {
  if (!transcript) return [];
  const lines: TranscriptLine[] = [];
  for (const raw of transcript.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(Agent|User|Assistant|Caller)\s*:\s*(.*)$/i);
    if (match) {
      const speaker: TranscriptLine["speaker"] = /^(agent|assistant)$/i.test(match[1]) ? "agent" : "caller";
      lines.push({ speaker, text: match[2] });
    } else if (lines.length > 0) {
      lines[lines.length - 1] = { ...lines[lines.length - 1], text: `${lines[lines.length - 1].text} ${line}` };
    } else {
      lines.push({ speaker: "caller", text: line });
    }
  }
  return lines;
}

const PROBLEM_DISCONNECT_PATTERNS = ["error", "failed", "no_answer", "machine", "transfer"];

function isProblemDisconnect(reason: string | null): boolean {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return PROBLEM_DISCONNECT_PATTERNS.some(p => lower.includes(p));
}

function friendlyDisconnect(reason: string | null): string {
  const lower = (reason ?? "").toLowerCase();
  if (lower.includes("transfer")) return "Sage tried to transfer the call to a person but it didn't go through.";
  if (lower.includes("no_answer")) return "The call rang out with no answer.";
  return "The call ended before it wrapped up.";
}

export default function VoiceAgent() {
  const [messages, setMessages] = useState<CapturedMessage[]>([]);
  const [callsData, setCallsData] = useState<CallsData | null>(null);
  const [checkingCalls, setCheckingCalls] = useState(false);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/voice/messages").then(async r => {
      if (!r.ok) return;
      const data = (await r.json()) as { messages: CapturedMessage[] };
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    }).catch(() => {});
  }, []);

  const fetchCalls = useCallback(async () => {
    setCheckingCalls(true);
    try {
      // Fetch more than MAX_ROWS so the "showing your 30 most recent calls"
      // truncation notice can actually engage once there are more than 30.
      const res = await fetch("/api/voice/calls?limit=50");
      const data = (await res.json()) as { enabled: boolean; error?: string; calls?: RetellCall[] };
      if (data.error) {
        // Keep whatever calls we already have on screen — an error refresh
        // shouldn't blank out a list the user was already looking at.
        setCallsData(prev => ({ enabled: data.enabled, error: data.error, calls: prev?.calls ?? data.calls ?? [] }));
      } else {
        setCallsData({ enabled: data.enabled, error: undefined, calls: data.calls ?? [] });
      }
    } catch {
      setCallsData(prev => ({ enabled: true, error: "network", calls: prev?.calls ?? [] }));
    } finally {
      setCheckingCalls(false);
    }
  }, []);
  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  const bookedCallIds = useMemo(
    () => new Set(messages.filter(m => m.type === "booking" && m.callId).map(m => m.callId as string)),
    [messages]
  );

  const sortedCalls = useMemo(
    () => [...(callsData?.calls ?? [])].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "")),
    [callsData]
  );
  const visibleCalls = sortedCalls.slice(0, MAX_ROWS);
  const truncated = sortedCalls.length > MAX_ROWS;

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 03 · Voice</div>
        <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Front Desk Agent</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Sage answers your line, gives info, transfers to a human when needed, and takes a message
          otherwise. Her voice, prompt, and knowledge are configured in Retell — the messages and call
          transcripts she captures show up here.
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
            {messages.slice(0, 12).map(msg => (
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

      <Card>
        <CardHead
          eyebrow="Call log"
          title="Every call to your line"
          action={
            <button
              type="button"
              onClick={fetchCalls}
              disabled={checkingCalls}
              className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkingCalls ? "Checking…" : "↻ Refresh"}
            </button>
          }
        />

        {callsData === null ? (
          <CallsSkeleton />
        ) : !callsData.enabled ? (
          <EmptyBody
            title="Not turned on yet"
            description="Sage's call log turns on once her phone system is connected — one small key to add."
          />
        ) : callsData.error && visibleCalls.length === 0 ? (
          <div role="alert" className="rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] text-[#9a4a32]">
            Couldn't load your calls right now. This is usually temporary — tap Refresh to try again.
          </div>
        ) : visibleCalls.length === 0 ? (
          <EmptyBody
            title="No calls yet"
            description="No calls yet — every call to your line shows up here."
          />
        ) : (
          <>
            {callsData.error && (
              <div role="alert" className="mb-3 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] text-[#9a4a32]">
                Couldn't refresh just now — showing the calls we last loaded. Tap Refresh to try again.
              </div>
            )}
            <ul className="divide-y divide-moss-700/8">
              {visibleCalls.map(call => (
                <CallRow
                  key={call.callId}
                  call={call}
                  booked={bookedCallIds.has(call.callId)}
                  expanded={expandedCallId === call.callId}
                  onToggle={() => setExpandedCallId(id => (id === call.callId ? null : call.callId))}
                />
              ))}
            </ul>
            {truncated && (
              <p className="mt-3 text-center text-[11px] text-muted">
                Showing your {visibleCalls.length} most recent calls.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function CallRow({
  call,
  booked,
  expanded,
  onToggle,
}: {
  call: RetellCall;
  booked: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const triggerId = `call-trigger-${call.callId}`;
  const panelId = `call-panel-${call.callId}`;

  const number = call.direction === "outbound" ? call.toNumber : call.fromNumber;
  const duration = formatDuration(call.durationSec);
  const isEnded = call.status === "ended";
  const isError = call.status === "error";
  const dotClass = isEnded ? "bg-moss-500" : isError ? "bg-[#9a4a32]" : "bg-champagne-400";
  // Only parse the transcript once a row is actually opened — most rows on a
  // busy call log never get expanded, so there's no reason to pay for it
  // upfront on every render.
  const transcriptLines = useMemo(
    () => (expanded ? parseTranscript(call.transcript) : []),
    [expanded, call.transcript]
  );
  const problem = isProblemDisconnect(call.disconnectionReason);
  const negativeSentiment = (call.sentiment ?? "").toLowerCase() === "negative";

  return (
    <li>
      <button
        type="button"
        id={triggerId}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="-mx-2 flex w-full flex-wrap items-center gap-3 rounded-lg px-2 py-3 text-left [touch-action:manipulation] transition hover:bg-cream/40"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="text-[14px] font-medium text-moss-700">{formatPhone(number)}</span>
        {call.direction === "outbound" && <Pill tone="neutral">Outbound</Pill>}
        {duration && <span className="text-[12px] text-muted">{duration}</span>}
        {booked && <Pill tone="moss">Booked</Pill>}
        {!isEnded && (isError ? <Pill tone="rose">Didn't connect</Pill> : <Pill tone="champagne">On a call now</Pill>)}
        {negativeSentiment && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#9a4a32]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9a4a32]" aria-hidden="true" />
            Worth a look
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted">{relativeCallTime(call.startedAt)}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 text-moss-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div id={panelId} role="region" aria-labelledby={triggerId} className="pb-4 pt-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">What this call was about</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            {call.summary || "Sage didn't leave a summary for this call."}
          </p>

          <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Full conversation</div>
          {transcriptLines.length > 0 ? (
            <div className="mt-2 max-h-72 space-y-2.5 overflow-y-auto rounded-xl border border-moss-700/10 bg-cream/50 p-3 [overscroll-behavior:contain]">
              {transcriptLines.map((line, i) => (
                <p key={i} className="text-[13px] leading-relaxed">
                  <span className={line.speaker === "agent" ? "font-semibold text-moss-700" : "font-semibold text-champagne-600"}>
                    {line.speaker === "agent" ? "Sage" : "Caller"}
                  </span>
                  <span className="text-ink"> {line.text}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12px] italic text-muted">Full transcript isn't available for this call.</p>
          )}

          {call.recordingUrl && (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-[12px] font-medium text-moss-700 transition hover:border-moss-500"
            >
              ▶ Listen to recording
            </a>
          )}

          {problem && (
            <div role="alert" className="mt-4 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
              <p className="font-semibold">This call didn't finish normally</p>
              <p className="mt-1">{friendlyDisconnect(call.disconnectionReason)}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function EmptyBody({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-moss-100/60 text-moss-500">
        <span className="block h-2.5 w-2.5 rounded-full border-2 border-moss-400" />
      </div>
      <h3 className="font-display text-lg font-semibold text-moss-700">{title}</h3>
      <p className="max-w-md text-[13px] leading-relaxed text-muted">{description}</p>
    </div>
  );
}

function CallsSkeleton() {
  return (
    <ul className="divide-y divide-moss-700/8">
      {[0, 1, 2].map(i => (
        <li key={i} className="flex items-center gap-3 py-3">
          <div className="h-4 w-28 animate-pulse rounded bg-moss-100/70" />
          <div className="h-4 flex-1 animate-pulse rounded bg-moss-100/50" />
        </li>
      ))}
    </ul>
  );
}
