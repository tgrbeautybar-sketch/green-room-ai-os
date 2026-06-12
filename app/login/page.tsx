"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign-in failed");
        setBusy(false);
        return;
      }
      const from = new URLSearchParams(window.location.search).get("from");
      router.push(from && from.startsWith("/") ? from : "/");
      router.refresh();
    } catch {
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-cream px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-moss-700 text-cream shadow-sm">
            <span className="font-display text-2xl leading-none">G</span>
          </div>
          <div className="mt-3 font-display text-2xl font-semibold tracking-tight text-moss-700">
            The Green Room
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Beauty Bar · AI OS</div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-moss-700/10 bg-white p-6 shadow-[0_18px_40px_-24px_rgba(31,61,46,0.3)]"
        >
          <label htmlFor="pw" className="block text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
            Password
          </label>
          <input
            id="pw"
            type="password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mt-2 w-full rounded-xl border border-moss-700/15 bg-cream/60 px-4 py-2.5 text-sm text-moss-800 outline-none transition focus:border-moss-500"
            placeholder="Enter your password"
          />

          {error && <p className="mt-3 text-[13px] text-[#9a4a32]">{error}</p>}

          <button
            type="submit"
            disabled={busy || password.length === 0}
            className="mt-4 w-full rounded-xl bg-moss-700 py-2.5 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted">Private dashboard · authorized access only</p>
      </div>
    </div>
  );
}
