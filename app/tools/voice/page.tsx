"use client";

import { useEffect, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";

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
  const [messages, setMessages] = useState<CapturedMsg[]>([]);

  useEffect(() => {
    fetch("/api/voice/messages").then(async r => {
      if (!r.ok) return;
      const data = (await r.json()) as { messages: CapturedMsg[] };
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    }).catch(() => {});
  }, []);

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

      <EmptyState
        eyebrow="Call transcripts"
        title="No calls yet"
        description="Once Sage is answering your line, every call's full transcript will appear here to review."
      />
    </div>
  );
}
