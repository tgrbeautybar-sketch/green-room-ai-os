"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHead } from "@/components/ui/Card";
import { Pill, Illustrative } from "@/components/ui/Pill";
import { Avatar } from "@/components/ui/Avatar";
import { draftCaption, PostType } from "@/lib/demo/captions";
import type { ZernioPost } from "@/lib/social-publish";

const TYPES: { id: PostType; label: string; desc: string; eyebrow: string }[] = [
  { id: "brand", label: "Salon Brand Post",  desc: "A piece of The Green Room's voice — for the salon page.", eyebrow: "Tool 01 · Post" },
  { id: "chair", label: "Chair / Room Open", desc: "Recruit a new stylist into a suite or chair.",            eyebrow: "Tool 01 · Post" },
];

const PLACEHOLDERS = ["🌿", "✂️", "💇", "✨"];
const NY_TZ = "America/New_York";

type Draft = { caption: string; hashtags: string[]; cta: string; mode: "live" | "demo" };
type When = "now" | "later";
type PhotoNotice =
  | { kind: "none" } // Instagram is on but no photo was ever attached
  | { kind: "blocking" } // a photo was attached but every upload failed
  | { kind: "partial"; succeeded: number; total: number; mediaUrls: string[] }
  | { kind: "caption" } // server rejected an empty caption
  | { kind: "channel" } // server rejected with no channel selected
  | { kind: "error" }; // network failure or an unrecognized server error
type PostsData = { enabled: boolean; error?: string; posts: ZernioPost[] };

// ---------- New York wall-clock time helpers (no new deps — Intl only) ----------

// "YYYY-MM-DDTHH:mm" for right now, as clock time in New York — used as the
// datetime-local `min` and for the past-time guard (both are plain string compares).
function nowInNYValue(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

// Converts a naive datetime-local value (interpreted as New York wall-clock time)
// into an ISO 8601 string with an explicit, DST-correct UTC offset. Probing noon UTC
// on the same calendar date is safe because noon UTC always lands in the morning in
// New York on that same date, so it reads the right EST/EDT offset for that day.
function toNyOffsetIso(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const tzPart = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find(p => p.type === "timeZoneName")?.value;
  const offset = tzPart?.replace("GMT", "") || "-05:00";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${datePart}T${pad(hh)}:${pad(mm)}:00${offset}`;
}

function fmtNYDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("month")} ${get("day")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

function fmtNYDayAndTime(iso: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { day: `${get("weekday")} ${get("month")} ${get("day")}`, time: `${get("hour")}:${get("minute")} ${get("dayPeriod")}` };
}

function platformLabel(p: string): string {
  if (p === "instagram") return "IG";
  if (p === "facebook") return "FB";
  return p;
}

// A post is "stuck" if it flat-out failed, or it's an Instagram post that's been
// sitting pending with no media for 10+ minutes — Instagram always needs a photo,
// so that combination means it will never actually publish on its own. A post
// scheduled for the future is never stuck, no matter how old or photo-less it
// is right now — it still has time to get a photo before it's due, so it
// belongs in Upcoming (with a warning), not Needs attention.
function isStuck(p: ZernioPost): boolean {
  if (p.status === "failed") return true;
  if (p.status !== "pending") return false;
  if (p.mediaCount > 0) return false;
  if (!p.platforms.includes("instagram")) return false;
  if (p.scheduledFor && new Date(p.scheduledFor).getTime() > Date.now()) return false;
  const ts = p.createdAt ?? p.scheduledFor;
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() > 10 * 60 * 1000;
}

const isDone = (p: ZernioPost) => p.status === "published" || p.status === "posted";

// True for a pending Instagram post that still has no photo attached — surfaced
// as a gentle inline warning on its Upcoming row rather than the Stuck treatment.
function needsPhoto(p: ZernioPost): boolean {
  return p.status === "pending" && p.mediaCount === 0 && p.platforms.includes("instagram");
}

export default function PostStudio() {
  const [type, setType] = useState<PostType>("brand");
  const [seed, setSeed] = useState<number>(7);
  const [igOn, setIgOn] = useState(true);
  const [fbOn, setFbOn] = useState(true);
  const [uploads, setUploads] = useState<string[]>([]); // data URLs
  const fileRef = useRef<HTMLInputElement | null>(null);

  // When to post
  const [when, setWhen] = useState<When>("now");
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local value, NY wall time

  // Publish flow
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [publishMode, setPublishMode] = useState<"live" | "demo" | null>(null);
  const [publishedAsScheduled, setPublishedAsScheduled] = useState(false);
  const [publishedScheduleIso, setPublishedScheduleIso] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<PhotoNotice | null>(null);

  // Status view
  const [postsData, setPostsData] = useState<PostsData | null>(null);
  const [checkingPosts, setCheckingPosts] = useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  // Editable caption (you can tweak the AI draft before posting)
  const [editedCaption, setEditedCaption] = useState("");

  // Brand voice — feeds AI caption generation; persisted to Supabase
  const [brand, setBrand] = useState("");
  const [brandBaseline, setBrandBaseline] = useState("");
  const [brandSaveState, setBrandSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Demo-mode initial draft (instant). Replaced by API call on Re-draft.
  const fallbackDraft = useMemo(() => draftCaption(type, undefined, seed), [type, seed]);
  const [draft, setDraft] = useState<Draft>({ ...fallbackDraft, mode: "demo" });
  const [drafting, setDrafting] = useState(false);

  function resetPublishState() {
    setPosted(false);
    setPublishMode(null);
    setPublishedAsScheduled(false);
    setPublishedScheduleIso(null);
    setPhotoNotice(null);
  }

  // Re-seed fallback when type changes (instant UX)
  useEffect(() => {
    setDraft({ ...fallbackDraft, mode: "demo" });
    resetPublishState();
  }, [type]);

  // Keep the editable caption in sync with the latest draft
  useEffect(() => { setEditedCaption(draft.caption); }, [draft]);

  // A photo notice reflects a specific publish attempt — once the channel, timing,
  // or caption changes, that attempt is stale, so clear it rather than leave a
  // mismatched notice up.
  useEffect(() => { setPhotoNotice(null); }, [igOn, fbOn, when, editedCaption]);

  // Load the saved brand voice
  useEffect(() => {
    fetch("/api/social/brand").then(async r => {
      if (!r.ok) return;
      const d = (await r.json()) as { text: string };
      setBrand(d.text ?? "");
      setBrandBaseline(d.text ?? "");
    }).catch(() => {});
  }, []);

  const fetchPosts = useCallback(async () => {
    setCheckingPosts(true);
    try {
      const res = await fetch("/api/social/posts");
      const data = (await res.json()) as { enabled: boolean; error?: string; posts?: ZernioPost[] };
      setPostsData({ enabled: data.enabled, error: data.error, posts: data.posts ?? [] });
    } catch {
      setPostsData({ enabled: true, error: "network", posts: [] });
    } finally {
      setCheckingPosts(false);
    }
  }, []);
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Gentle background refresh — only while something is actually still in flight,
  // and only while Belinda has the tab open (no point burning requests in a background tab).
  useEffect(() => {
    const hasPending = (postsData?.posts ?? []).some(p => p.status === "pending" || p.status === "draft");
    if (!hasPending) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchPosts();
    }, 30_000);
    return () => clearInterval(id);
  }, [postsData, fetchPosts]);

  const carousel = useMemo(() => {
    if (uploads.length > 0) return uploads.slice(0, 3);
    return Array.from({ length: 3 }, (_, i) => PLACEHOLDERS[(seed + i) % PLACEHOLDERS.length]);
  }, [seed, uploads]);

  async function regenerate() {
    setDrafting(true);
    resetPublishState();
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, seed }),
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

  // Uploads every locally-staged image and reports back what actually made it —
  // callers decide what to do with a partial or total failure, nothing is swallowed.
  async function uploadAll(): Promise<{ mediaUrls: string[]; total: number; succeeded: number }> {
    const toUpload = uploads.filter(u => u.startsWith("data:"));
    const mediaUrls: string[] = [];
    for (const dataUrl of toUpload) {
      try {
        const up = await fetch("/api/social/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        if (up.ok) {
          const { url } = (await up.json()) as { url: string };
          if (url) mediaUrls.push(url);
        }
      } catch {
        // counted as a failure via the total/succeeded gap below — no silent skip
      }
    }
    return { mediaUrls, total: toUpload.length, succeeded: mediaUrls.length };
  }

  async function doPublish(mediaUrls: string[]) {
    if (posting) return; // guard against a double-fire re-entering mid-publish
    setPosting(true);
    try {
      const scheduling = when === "later" && !!scheduledAt;
      const scheduledForIso = scheduling ? toNyOffsetIso(scheduledAt) : undefined;

      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editedCaption,
          hashtags: draft.hashtags,
          igOn,
          fbOn,
          mediaUrls,
          scheduledFor: scheduledForIso,
          timezone: scheduledForIso ? NY_TZ : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { mode?: "live" | "demo"; error?: string };

      if (res.ok) {
        setPosted(true);
        setPublishMode(data.mode ?? "demo");
        setPublishedAsScheduled(scheduling);
        setPublishedScheduleIso(scheduledForIso ?? null);
        fetchPosts();
      } else {
        // Server caught something the client-side checks missed (e.g. a race) —
        // map it to an honest, specific notice instead of always blaming the photo.
        switch (data.error) {
          case "empty caption":
            setPhotoNotice({ kind: "caption" });
            break;
          case "pick a channel":
            setPhotoNotice({ kind: "channel" });
            break;
          case "Instagram requires an image.":
            setPhotoNotice({ kind: "blocking" });
            break;
          default:
            setPhotoNotice({ kind: "error" });
        }
      }
    } catch (err) {
      console.error(err);
      setPhotoNotice({ kind: "error" });
    } finally {
      setPosting(false);
    }
  }

  async function schedule() {
    if (posting) return; // guard against a double-fire re-entering mid-schedule
    setPhotoNotice(null);
    setPosting(true);
    const { mediaUrls, total, succeeded } = await uploadAll();

    if (igOn && succeeded === 0) {
      // Either no photos were attached at all, or some were attached but every
      // one failed to host — those need different copy, since only the second
      // one is worth retrying.
      setPosting(false);
      setPhotoNotice(total === 0 ? { kind: "none" } : { kind: "blocking" });
      return;
    }
    if (igOn && succeeded < total) {
      setPosting(false);
      setPhotoNotice({ kind: "partial", succeeded, total, mediaUrls });
      return;
    }

    await doPublish(mediaUrls);
  }

  async function saveBrand() {
    setBrandSaveState("saving");
    try {
      const res = await fetch("/api/social/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: brand }),
      });
      if (!res.ok) throw new Error(await res.text());
      setBrandBaseline(brand);
      setBrandSaveState("saved");
      setTimeout(() => setBrandSaveState("idle"), 1800);
    } catch {
      setBrandSaveState("error");
      setTimeout(() => setBrandSaveState("idle"), 2400);
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

  async function removePost(id: string) {
    setConfirmingRemoveId(null);
    setPostsData(pd => (pd ? { ...pd, posts: pd.posts.filter(p => p.id !== id) } : pd)); // optimistic
    try {
      const res = await fetch(`/api/social/posts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      fetchPosts(); // self-heal: restore the true list if the delete didn't actually happen
    }
  }

  const brandDirty = brand !== brandBaseline;
  const noChannel = !igOn && !fbOn;
  const laterMissing = when === "later" && !scheduledAt;
  const laterPast = when === "later" && !!scheduledAt && scheduledAt < nowInNYValue();
  const laterInvalid = laterMissing || laterPast;
  const publishDisabled = posted || posting || noChannel || drafting || photoNotice !== null || laterInvalid;

  function primaryLabel(): string {
    if (posted) return publishedAsScheduled ? "Scheduled ✓" : "Posted ✓";
    if (posting) return when === "later" ? "Scheduling…" : "Posting…";
    if (noChannel) return "Pick a channel";
    if (when === "later") {
      return laterInvalid ? "Pick a date & time" : `Schedule · ${fmtNYDateTime(toNyOffsetIso(scheduledAt))}`;
    }
    return `Post now · ${[igOn && "IG", fbOn && "FB"].filter(Boolean).join(" + ")}`;
  }

  const needsAttention = useMemo(
    () => (postsData?.posts ?? []).filter(isStuck).sort(byRecencyDesc),
    [postsData]
  );
  const upcoming = useMemo(
    () =>
      (postsData?.posts ?? [])
        .filter(p => !isStuck(p) && !isDone(p))
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")),
    [postsData]
  );
  const postedPosts = useMemo(
    () => (postsData?.posts ?? []).filter(p => !isStuck(p) && isDone(p)).sort(byRecencyDesc),
    [postsData]
  );

  function removeControl(id: string) {
    if (confirmingRemoveId === id) {
      return (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px]">
          <span className="text-[#9a4a32]">Remove this?</span>
          <button
            type="button"
            onClick={() => removePost(id)}
            className="rounded-md bg-[#9a4a32] px-2 py-0.5 font-medium text-cream hover:opacity-90"
          >
            Yes, remove
          </button>
          <button
            type="button"
            onClick={() => setConfirmingRemoveId(null)}
            className="rounded-md border border-moss-700/15 bg-white px-2 py-0.5 text-moss-700 hover:border-moss-500"
          >
            Keep
          </button>
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setConfirmingRemoveId(id)}
        className="rounded-md border border-transparent px-1.5 py-0.5 text-[11px] text-muted transition hover:border-[#c8857a]/40 hover:text-[#9a4a32]"
      >
        Remove
      </button>
    );
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

      <Card>
        <CardHead
          eyebrow="Brand voice"
          title="What the AI should know about your salon"
          action={
            <div className="flex items-center gap-2">
              {brandDirty && (
                <button
                  onClick={() => setBrand(brandBaseline)}
                  className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] text-moss-700 hover:border-moss-500"
                >
                  Revert
                </button>
              )}
              <button
                onClick={saveBrand}
                disabled={!brandDirty || brandSaveState === "saving"}
                className="rounded-lg bg-moss-700 px-3 py-1.5 text-[12px] text-cream shadow-sm transition hover:bg-moss-600 disabled:bg-moss-300"
              >
                {brandSaveState === "saving" ? "Saving…"
                  : brandSaveState === "saved" ? "Saved ✓"
                  : brandSaveState === "error" ? "Retry"
                  : brandDirty ? "Save" : "Saved ✓"}
              </button>
            </div>
          }
        />
        <p className="mb-2 text-[12px] text-muted">
          Tone, things to mention, words to use or avoid — the agent weaves this into every caption it drafts.
        </p>
        <textarea
          value={brand}
          onChange={e => setBrand(e.target.value)}
          rows={4}
          placeholder="e.g. Warm but not cheesy. We're a collective of independent stylists. Always point people to book at tgrbeautybar.com. Never use 'pamper yourself' or exclamation spam."
          className="w-full resize-none rounded-xl border border-moss-700/10 bg-cream/60 p-4 text-[13px] leading-relaxed text-moss-800 outline-none transition placeholder:text-muted/70 focus:border-moss-500"
        />
      </Card>

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
                <div className="text-[11px] text-muted">Sponsored · The Green Room</div>
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
              {drafting ? "Sage is drafting in the Green Room voice…" : editedCaption}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {draft.hashtags.map(h => <span key={h} className="text-[12px] text-moss-500">{h}</span>)}
            </div>
            <div className="mt-2 text-[12px] font-medium text-champagne-600">CTA · {draft.cta}</div>
          </div>

          <div className="mt-4">
            <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Caption — edit before posting</label>
            <textarea
              value={editedCaption}
              onChange={e => setEditedCaption(e.target.value)}
              disabled={drafting}
              rows={5}
              className="mt-1 w-full resize-none rounded-xl border border-moss-700/10 bg-cream/60 p-3 text-[13px] leading-relaxed text-moss-800 outline-none transition focus:border-moss-500"
            />
          </div>

          <div className="mt-4">
            <label className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">When to post</label>
            <div className="mt-1.5 flex w-full gap-1 rounded-xl border border-moss-700/12 bg-cream/60 p-1 sm:inline-flex sm:w-auto">
              <button
                type="button"
                aria-pressed={when === "now"}
                onClick={() => setWhen("now")}
                className={[
                  "flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition sm:flex-none",
                  when === "now" ? "bg-moss-700 text-cream shadow-sm" : "text-moss-700 hover:bg-white/70",
                ].join(" ")}
              >
                Post now
              </button>
              <button
                type="button"
                aria-pressed={when === "later"}
                onClick={() => setWhen("later")}
                className={[
                  "flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition sm:flex-none",
                  when === "later" ? "bg-moss-700 text-cream shadow-sm" : "text-moss-700 hover:bg-white/70",
                ].join(" ")}
              >
                Schedule for later
              </button>
            </div>

            {when === "later" && (
              <div className="mt-3">
                <label htmlFor="scheduledAt" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  Date &amp; time (salon time — New York)
                </label>
                <input
                  id="scheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  min={nowInNYValue()}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="mt-1 rounded-lg border border-moss-700/15 bg-white px-3 py-2 text-sm text-moss-800 outline-none focus:border-moss-500"
                />
                {laterPast ? (
                  <p role="alert" className="mt-1.5 text-[12px] text-[#9a4a32]">
                    That time has already passed. Pick a time later today or another day.
                  </p>
                ) : scheduledAt ? (
                  <p className="mt-1.5 text-[12px] text-muted">
                    We'll post it automatically at this time. You don't need to keep this open.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {photoNotice?.kind === "none" && (
            <div role="alert" className="mt-4 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
              <p className="font-semibold">Instagram needs a photo</p>
              <p className="mt-1">
                Instagram always needs a photo. Add one above, or switch to Facebook only.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setIgOn(false); setPhotoNotice(null); }}
                  disabled={posting}
                  className="rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Post to Facebook only
                </button>
              </div>
            </div>
          )}

          {photoNotice?.kind === "blocking" && (
            <div role="alert" className="mt-4 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
              <p className="font-semibold">Instagram needs a photo</p>
              <p className="mt-1">
                Your photo couldn't be uploaded right now (this is usually temporary). Try again in a
                few minutes, or switch to Facebook only for now.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => schedule()}
                  disabled={posting}
                  className="rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => { setIgOn(false); setPhotoNotice(null); }}
                  disabled={posting}
                  className="rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Post to Facebook only
                </button>
              </div>
            </div>
          )}

          {photoNotice?.kind === "partial" && (
            <div role="alert" className="mt-4 rounded-xl border border-champagne-200 bg-champagne-100/60 px-4 py-3 text-[13px] leading-relaxed text-champagne-600">
              <p>
                Heads up — {photoNotice.total - photoNotice.succeeded} of your {photoNotice.total} photos
                couldn't be uploaded. We can post with the {photoNotice.succeeded} that worked, or you
                can try again to include them all.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { const mu = photoNotice.mediaUrls; setPhotoNotice(null); doPublish(mu); }}
                  disabled={posting}
                  className="rounded-lg bg-moss-700 px-3 py-1.5 text-[12px] font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:cursor-not-allowed disabled:bg-moss-300"
                >
                  Post with {photoNotice.succeeded} photo{photoNotice.succeeded === 1 ? "" : "s"}
                </button>
                <button
                  type="button"
                  onClick={() => { setPhotoNotice(null); schedule(); }}
                  disabled={posting}
                  className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {photoNotice?.kind === "caption" && (
            <div role="alert" className="mt-4 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
              <p className="font-semibold">Add a caption</p>
              <p className="mt-1">Write a caption before posting.</p>
            </div>
          )}

          {photoNotice?.kind === "channel" && (
            <div role="alert" className="mt-4 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
              <p className="font-semibold">Pick a channel</p>
              <p className="mt-1">Turn on Instagram or Facebook before posting.</p>
            </div>
          )}

          {photoNotice?.kind === "error" && (
            <div role="alert" className="mt-4 rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] leading-relaxed text-[#9a4a32]">
              <p className="font-semibold">Something went wrong</p>
              <p className="mt-1">
                Something went wrong and this post didn't go out. Check your internet and try again.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => schedule()}
                  disabled={posting}
                  className="rounded-lg border border-[#f3cdbf] bg-white px-3 py-1.5 text-[12px] font-medium text-[#9a4a32] transition hover:border-[#9a4a32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={schedule}
              disabled={publishDisabled}
              className="rounded-lg bg-moss-700 px-4 py-2 text-sm font-medium text-cream shadow-sm transition hover:bg-moss-600 disabled:cursor-not-allowed disabled:bg-moss-300"
            >
              {primaryLabel()}
            </button>
            <button
              onClick={() => { setSeed(s => s + 13); regenerate(); }}
              disabled={drafting}
              className="rounded-lg border border-moss-700/15 bg-white px-4 py-2 text-sm font-medium text-moss-700 transition hover:border-moss-500 disabled:opacity-60"
            >
              {drafting ? "…" : "Tweak voice ↻"}
            </button>
            {posted && (
              <span className="text-[12px] text-muted">
                {publishMode === "demo"
                  ? "Demo mode — connect your accounts (free) to post for real."
                  : publishedAsScheduled && publishedScheduleIso
                  ? (() => {
                      const { day, time } = fmtNYDayAndTime(publishedScheduleIso);
                      return `All set — this posts to your salon accounts on ${day} at ${time}.`;
                    })()
                  : "Posted to your salon accounts."}
              </span>
            )}
          </div>
        </Card>
      </section>

      <Card>
        <CardHead
          eyebrow="History"
          title="Your posts"
          action={
            <button
              type="button"
              onClick={fetchPosts}
              disabled={checkingPosts}
              className="rounded-lg border border-moss-700/15 bg-white px-3 py-1.5 text-[12px] font-medium text-moss-700 transition hover:border-moss-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkingPosts ? "Checking…" : "↻ Refresh"}
            </button>
          }
        />

        {postsData === null ? (
          <SkeletonRows />
        ) : !postsData.enabled ? (
          <EmptyBody
            title="Not connected yet"
            description="Your Instagram and Facebook aren't connected here yet, so there's nothing to show. Once they're connected, every scheduled and posted item lands here."
          />
        ) : postsData.error ? (
          <div role="alert" className="rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/50 px-4 py-3 text-[13px] text-[#9a4a32]">
            Couldn't load your posts right now. This is usually temporary — tap Refresh to try again.
          </div>
        ) : postsData.posts.length === 0 ? (
          <EmptyBody title="No posts yet" description="Posts you schedule or publish will show up here." />
        ) : (
          <div className="space-y-5">
            {needsAttention.length > 0 && (
              <div className="rounded-xl border border-[#f3cdbf] bg-[#fbe9e3]/40 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#9a4a32]">
                  Needs attention · {needsAttention.length}
                </div>
                <ul className="mt-1 divide-y divide-[#f3cdbf]/60">
                  {needsAttention.map(p => (
                    <li key={p.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#9a4a32]" />
                        <span className="truncate text-[13px] font-medium text-moss-700">{p.content || "(no caption)"}</span>
                        <Pill tone="rose">Stuck</Pill>
                        <span className="ml-auto">{removeControl(p.id)}</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#9a4a32]">
                        This didn't reach Instagram — Instagram always needs a photo, and the photo
                        didn't upload. Post it again with the photo once your images are working.
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {upcoming.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted">Upcoming</div>
                <ul className="divide-y divide-moss-700/8">
                  {upcoming.map(p => (
                    <li key={p.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-champagne-400" />
                        <span className="text-[13px] font-medium text-moss-700">
                          {p.scheduledFor ? fmtNYDateTime(p.scheduledFor) : "—"}
                        </span>
                        <span className="max-w-[22rem] truncate text-[13px] text-muted">{p.content}</span>
                        {p.platforms.map(pl => <Pill key={pl} tone="neutral">{platformLabel(pl)}</Pill>)}
                        <span className="ml-auto flex items-center gap-2">
                          <Pill tone="champagne">Scheduled</Pill>
                          {removeControl(p.id)}
                        </span>
                      </div>
                      {needsPhoto(p) && (
                        <p className="mt-1 pl-4 text-[12px] leading-relaxed text-champagne-600">
                          This one has no photo yet — Instagram needs one to post.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {postedPosts.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted">Posted</div>
                <ul className="divide-y divide-moss-700/8">
                  {postedPosts.map(p => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-moss-500" />
                      <span className="text-[13px] font-medium text-moss-700">
                        {p.createdAt ? fmtNYDateTime(p.createdAt) : ""}
                      </span>
                      <span className="max-w-[22rem] truncate text-[13px] text-muted">{p.content}</span>
                      {p.platforms.map(pl => <Pill key={pl} tone="neutral">{platformLabel(pl)}</Pill>)}
                      {/* No Remove here — Zernio's DELETE semantics on a live published
                          post are unverified, so we don't offer an action that could
                          accidentally touch something already posted. */}
                      <span className="ml-auto">
                        <Pill tone="moss">Posted ✓</Pill>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function byRecencyDesc(a: ZernioPost, b: ZernioPost): number {
  return (b.createdAt ?? b.scheduledFor ?? "").localeCompare(a.createdAt ?? a.scheduledFor ?? "");
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

function SkeletonRows() {
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
