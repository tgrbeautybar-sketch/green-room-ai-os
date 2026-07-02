"use client";

import { useState } from "react";

export default function SmsSignupPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !consent) return;
    setState("sending");
    try {
      const res = await fetch("/api/hooks/sms-optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, consent }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-moss-700 text-cream">
          <span className="font-display text-2xl leading-none">G</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-semibold text-moss-700">The Green Room Beauty Bar</h1>
        <p className="text-[13px] text-muted">Rent-reminder text sign-up</p>
      </div>

      {state === "done" ? (
        <div className="rounded-2xl border border-moss-700/10 bg-white p-6 text-center">
          <p className="text-[15px] text-moss-700">You're signed up ✓</p>
          <p className="mt-2 text-[13px] text-muted">
            You'll receive rent-payment reminders by text. Reply <b>STOP</b> any time to opt out.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-moss-700/10 bg-white p-6 shadow-sm">
          <p className="text-[14px] leading-relaxed text-ink">
            Renters of The Green Room Beauty Bar can sign up here to receive rent-payment reminders and account
            notifications by text.
          </p>

          <label className="mt-4 block text-[12px] font-medium uppercase tracking-[0.14em] text-muted">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-moss-700/15 bg-cream/60 px-3 py-2 text-sm outline-none focus:border-moss-500"
            placeholder="Your name"
          />

          <label className="mt-3 block text-[12px] font-medium uppercase tracking-[0.14em] text-muted">Mobile number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-moss-700/15 bg-cream/60 px-3 py-2 text-sm outline-none focus:border-moss-500"
            placeholder="(978) 555-0100"
          />

          <label className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              I agree to receive rent-payment reminder and account-notification text messages from The Green Room
              Beauty Bar at the number I provided. Message frequency varies (typically 1–2/week). Message &amp; data
              rates may apply. Reply STOP to opt out, HELP for help. See our{" "}
              <a href="/sms-terms" className="text-moss-600 underline">SMS Terms</a> and{" "}
              <a href="/privacy" className="text-moss-600 underline">Privacy Policy</a>.
            </span>
          </label>

          {state === "error" && <p className="mt-3 text-[13px] text-[#9a4a32]">Something went wrong — please try again.</p>}

          <button
            type="submit"
            disabled={!phone.trim() || !consent || state === "sending"}
            className="mt-4 w-full rounded-lg bg-moss-700 py-2.5 text-sm font-medium text-cream transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            {state === "sending" ? "Signing up…" : "Sign up for reminders"}
          </button>
        </form>
      )}
    </div>
  );
}
