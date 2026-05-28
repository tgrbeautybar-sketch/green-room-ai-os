"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { Avatar } from "@/components/ui/Avatar";
import { stylists } from "@/lib/demo/stylists";
import { draftCaption, PostType } from "@/lib/demo/captions";

const TYPES: { id: PostType; label: string; desc: string; eyebrow: string }[] = [
  { id: "spotlight", label: "Stylist Spotlight", desc: "Highlight one of your stylists and link their book.", eyebrow: "Tool 01 · Post" },
  { id: "chair",     label: "Chair / Room Open", desc: "Recruit a new stylist into a suite or chair.",         eyebrow: "Tool 01 · Post" },
  { id: "brand",     label: "Salon Brand Post",  desc: "A piece of voice — no specific person.",               eyebrow: "Tool 01 · Post" },
];

const PLACEHOLDERS = ["🌿", "✂️", "💇", "✨"];

type Draft = { caption: string; hashtags: string[]; cta: string; mode: "live" | "demo" };

export default function PostStudio() {
  const [type, setType] = useState<PostType>("spotlight");
  const [stylistId, setStylistId] = useState<string>(stylists[1].id);
  const [seed, setSeed] = useState<number>(7);
  const [scheduled, setScheduled] = useState(false);
  const [igOn, setIgOn] = useState(true);
  const [fbOn, setFbOn] = useState(true);
  const [uploads, setUploads] = useState<string[]>([]); // data URLs
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stylist = stylists.find(s => s.id === stylistId)!;

  // Demo-mode initial draft (instant). Replaced by API call on Re-draft.
  const fallbackDraft = useMemo(() => draftCaption(type, stylist, seed), [type, stylist, seed]);
  const [draft, setDraft] = useState<Draft>({ ...fallbackDraft, mode: "demo" });
  const [drafting, setDrafting] = useState(false);

  // Re-seed fallback when type/stylist changes (instant UX)
  useEffect(() => {
    setDraft({ ...fallbackDraft, mode: "demo" });
    setScheduled(false);
  }, [type, stylistId]);

  const carousel = useMemo(() => {
    if (uploads.length > 0) return uploads.slice(0, 3);
    return Array.from({ length: 3 }, (_, i) => PLACEHOLDERS[(seed + i) % PLACEHOLDERS.length]);
  }, [seed, uploads]);

  async function regenerate() {
    setDrafting(true);
    setScheduled(false);
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, stylistId, seed }),
      });
      if (res.ok) {
        const data = (await res.json()) as Draft;
        setDraft(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDrafting(false);
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3);
    if (files.length === 0) return;
    Promise.all(
      files.map(
        f =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(f);
          })
      )
    ).then(setUploads);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">Tool 01 · Social</div>
          <h1 className="mt-1 font-display text-3xl font-semibold text-moss-700">Post Studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pick a post type, drop in your assets, and the agent drafts the caption in The Green Room's
            voice. Approve here, it schedules to Instagram and Facebook.
          </p>
        </div>
        <Illustrative />
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => { setType(t.id); }}
            className={[
              "group text-left rounded-2xl border p-4 transition",
              type === t.id
                ? "border-moss-500 bg-white shadow-[0_8px_24px_-16px_rgba(31,61,46,0.25)]"
                : "border-moss-700/8 bg-white/70 hover:border-moss-300",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-champagne-600">{t.eyebrow}</div>
              {type === t.id && <Pill tone="moss">selected</Pill>}
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-moss-700">{t.label}</h3>
            <p className="mt-1 text-[13px] text-muted">{t.desc}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <Card>
          <CardHead
            eyebrow="Step 1"
            title="Configure"
            action={
              <button
                onClick={() => { setSeed(s => s + 1); regenerate(); }}
                disabled={drafting}
                className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
              >
                {drafting ? "Drafting…" : "Re-draft ↻"}
              </button>
            }
          />

          {type === "spotlight" && (
            <div className="space-y-3">
              <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Stylist</label>
              <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
                {stylists.filter(s => s.role !== "Owner").map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setStylistId(s.id); }}
                    className={[
                      "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 transition",
                      s.id === stylistId
                        ? "border-moss-500 bg-moss-100/40"
                        : "border-moss-700/10 bg-white hover:border-moss-300",
                    ].join(" ")}
                  >
                    <Avatar initials={s.initials} hueDeg={s.hueDeg} size={28} />
                    <div className="text-left">
                      <div className="text-[13px] font-medium text-moss-700">{s.name.split(" ")[0]}</div>
                      <div className="text-[11px] text-muted">{s.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Assets</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {carousel.map((src, i) => (
                <div key={i} className="aspect-square overflow-hidden rounded-xl border border-dashed border-moss-700/15 bg-cream">
                  {typeof src === "string" && src.startsWith("data:")
                    ? <img src={src} alt="" className="h-full w-full object-cover" />
                    : <div className="grid h-full place-items-center bg-gradient-to-br from-moss-100/40 to-champagne-100 text-4xl">{src}</div>}
                </div>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onFiles}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full rounded-xl border border-dashed border-moss-700/20 bg-white/60 py-3 text-[13px] text-muted transition hover:border-moss-300 hover:text-moss-700"
            >
              {uploads.length > 0 ? `${uploads.length} image${uploads.length === 1 ? "" : "s"} loaded — tap to replace` : "+ Drop images, or pick from your phone"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
            <Channel label="Instagram" enabled={igOn} onToggle={() => setIgOn(v => !v)} />
            <Channel label="Facebook" enabled={fbOn} onToggle={() => setFbOn(v => !v)} />
          </div>
        </Card>

        <Card>
          <CardHead
            eyebrow="Step 2"
            title="Preview & approve"
            action={
              <div className="flex items-center gap-2">
                {draft.mode === "live"
                  ? <Pill tone="moss">drafted by Claude</Pill>
                  : <Pill tone="champagne">demo draft</Pill>}
              </div>
            }
          />
          <div className="rounded-2xl border border-moss-700/8 bg-cream p-4">
            <div className="flex items-center gap-2">
              <Avatar initials="GR" hueDeg={130} size={36} />
              <div className="leading-tight">
                <div className="text-[13px] font-semibold text-moss-700">thegreenroombeautybar</div>
                <div className="text-[11px] text-muted">{type === "spotlight" ? `with ${stylist.handle}` : "Sponsored · The Green Room"}</div>
              </div>
            </div>

            <div className="mt-3 grid aspect-[4/5] grid-cols-3 overflow-hidden rounded-xl">
              {carousel.map((src, i) => (
                <div
                  key={i}
                  className="grid place-items-center text-5xl"
                  style={
                    typeof src === "string" && src.startsWith("data:")
                      ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }
                      : {
                          background:
                            i === 0
                              ? "linear-gradient(135deg, #dce5dd 0%, #b9ccba 100%)"
                              : i === 1
                              ? "linear-gradient(135deg, #f5ecd9 0%, #ebdab3 100%)"
                              : "linear-gradient(135deg, #1f3d2e 0%, #2a5230 100%)",
                          color: i === 2 ? "#f5ecd9" : "#1f3d2e",
                        }
                  }
                >
                  {typeof src === "string" && src.startsWith("data:") ? null : src}
                </div>
              ))}
            </div>

            <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
              {drafting ? "Sage is drafting in the Green Room voice…" : draft.caption}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {draft.hashtags.map(h => <span key={h} className="text-[12px] text-moss-500">{h}</span>)}
            </div>
            <div className="mt-2 text-[12px] font-medium text-champagne-600">CTA · {draft.cta}</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setScheduled(true)}
              disabled={scheduled || (!igOn && !fbOn) || drafting}
              className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
            >
              {scheduled
                ? "Scheduled ✓"
                : (!igOn && !fbOn)
                ? "Pick a channel"
                : `Schedule today 5:30 PM · ${[igOn && "IG", fbOn && "FB"].filter(Boolean).join(" + ")}`}
            </button>
            <button
              onClick={() => { setSeed(s => s + 13); regenerate(); }}
              disabled={drafting}
              className="rounded-lg border border-moss-700/15 bg-white px-4 py-2 text-sm font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
            >
              {drafting ? "…" : "Tweak voice ↻"}
            </button>
            {scheduled && (
              <span className="text-[12px] text-muted">Demo only — live mode uses Meta Graph API.</span>
            )}
          </div>
        </Card>
      </section>

      <Card>
        <CardHead eyebrow="History" title="Drafted today" />
        <ul className="divide-y divide-moss-700/8">
          {[
            { who: "Melissa Tran",  what: "Stylist spotlight",   status: "scheduled", time: "9:14 AM" },
            { who: "—",             what: "Brand post · neighborhood salon", status: "draft",     time: "11:02 AM" },
            { who: "Suite 5 open",  what: "Chair / Room open",   status: "draft",     time: "4:18 PM" },
          ].map((row, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-moss-700">{row.what}</div>
                <div className="text-[12px] text-muted">{row.who} · {row.time}</div>
              </div>
              <Pill tone={row.status === "scheduled" ? "moss" : "champagne"}>{row.status}</Pill>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Channel({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={[
        "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition",
        enabled ? "border-moss-500 bg-moss-100/40 text-moss-700" : "border-moss-700/10 bg-white text-muted hover:border-moss-300",
      ].join(" ")}
      type="button"
    >
      <span className="font-medium">{label}</span>
      <span className={`h-2 w-2 rounded-full ${enabled ? "bg-moss-500" : "bg-moss-200"}`} />
    </button>
  );
}
