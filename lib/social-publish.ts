import "server-only";

// Automated publishing via Zernio (https://zernio.com/api/v1) — free tier covers
// 2 accounts (Instagram + Facebook), which is exactly Belinda's setup.
// Env-gated: with no key set, we stay in demo mode and the UI still works.

const BASE = "https://zernio.com/api/v1";
const apiKey = process.env.ZERNIO_API_KEY;
const IG_ACCOUNT = process.env.ZERNIO_IG_ACCOUNT_ID;
const FB_ACCOUNT = process.env.ZERNIO_FB_ACCOUNT_ID;

export const publishEnabled = !!apiKey;

export type PublishInput = {
  content: string; // caption + hashtags, already composed
  igOn: boolean;
  fbOn: boolean;
  scheduledFor?: string; // ISO 8601; omit to post immediately
  timezone?: string;
  mediaUrls?: string[]; // PUBLIC https URLs — Instagram requires media
};

export type PublishResult =
  | { mode: "live"; id?: string; platforms: string[] }
  | { mode: "demo"; reason: string; platforms: string[] };

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  const wanted = [input.igOn && "instagram", input.fbOn && "facebook"].filter(Boolean) as string[];

  const platforms: { platform: string; accountId: string }[] = [];
  if (input.igOn && IG_ACCOUNT) platforms.push({ platform: "instagram", accountId: IG_ACCOUNT });
  if (input.fbOn && FB_ACCOUNT) platforms.push({ platform: "facebook", accountId: FB_ACCOUNT });

  // Fall back to demo if not configured — keeps the demo working with no creds.
  if (!apiKey || platforms.length === 0) {
    return {
      mode: "demo",
      reason: !apiKey ? "ZERNIO_API_KEY not set" : "no connected account for the selected channel(s)",
      platforms: wanted,
    };
  }

  const body: Record<string, unknown> = { content: input.content, platforms };
  if (input.scheduledFor) {
    body.scheduledFor = input.scheduledFor;
    body.timezone = input.timezone ?? "America/New_York";
  }
  if (input.mediaUrls && input.mediaUrls.length > 0) body.media = input.mediaUrls;

  const res = await fetch(`${BASE}/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zernio publish failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string; postId?: string };
  return { mode: "live", id: data.id ?? data.postId, platforms: platforms.map(p => p.platform) };
}

// ---------- status view: list + delete posts ----------
//
// Zernio's per-post response nests status/attempts/scheduledFor PER PLATFORM entry
// (verified live: a post's top-level `status` can read "draft" while each platform in
// `platforms[]` carries its own "pending"/"published"/"failed" and `customMedia`, while
// `mediaItems` sits on the post itself). We normalize down to one sensible post-level
// record: worst platform status wins, earliest scheduledFor wins, media counted from
// whichever field actually holds items.

export type ZernioPost = {
  id: string;
  content: string;
  status: string; // normalized: "failed" | "pending" | "published" | "draft" (worst platform status wins)
  publishAttempts: number;
  scheduledFor?: string;
  platforms: string[]; // e.g. ["instagram", "facebook"]
  mediaCount: number;
  createdAt?: string;
};

type RawZernioPlatform = {
  platform?: string;
  status?: string;
  publishAttempts?: number;
  scheduledFor?: string;
  customMedia?: unknown[];
};

type RawZernioPost = {
  _id?: string;
  id?: string;
  content?: string;
  status?: string;
  publishAttempts?: number;
  scheduledFor?: string;
  createdAt?: string;
  mediaItems?: unknown[];
  media?: unknown[];
  platforms?: RawZernioPlatform[];
};

// Higher rank "loses" (i.e. wins as the worse status to surface to Belinda).
const STATUS_RANK: Record<string, number> = {
  failed: 3,
  pending: 2,
  scheduled: 2,
  processing: 2,
  draft: 1,
  published: 0,
  posted: 0,
};

function worstStatus(statuses: string[], fallback: string): string {
  if (statuses.length === 0) return fallback;
  return statuses.reduce((worst, s) => ((STATUS_RANK[s] ?? 2) > (STATUS_RANK[worst] ?? 2) ? s : worst));
}

function normalizePost(raw: RawZernioPost): ZernioPost {
  const platforms = Array.isArray(raw.platforms) ? raw.platforms : [];
  const platformStatuses = platforms.map(p => p.status).filter((s): s is string => !!s);
  const platformAttempts = platforms.map(p => p.publishAttempts).filter((n): n is number => typeof n === "number");
  const scheduledCandidates = [
    raw.scheduledFor,
    ...platforms.map(p => p.scheduledFor),
  ].filter((s): s is string => !!s);

  const topMediaCount = Array.isArray(raw.mediaItems)
    ? raw.mediaItems.length
    : Array.isArray(raw.media)
    ? raw.media.length
    : 0;
  const platformMediaCount = platforms.reduce(
    (sum, p) => sum + (Array.isArray(p.customMedia) ? p.customMedia.length : 0),
    0
  );

  return {
    id: raw._id ?? raw.id ?? "",
    content: raw.content ?? "",
    status: worstStatus(platformStatuses, raw.status ?? "pending"),
    publishAttempts: platformAttempts.length > 0 ? Math.max(...platformAttempts) : raw.publishAttempts ?? 0,
    scheduledFor: scheduledCandidates.length > 0 ? scheduledCandidates.sort()[0] : undefined,
    platforms: [...new Set(platforms.map(p => p.platform).filter((p): p is string => !!p))],
    mediaCount: Math.max(topMediaCount, platformMediaCount),
    createdAt: raw.createdAt,
  };
}

export async function listPosts(limit = 25): Promise<ZernioPost[]> {
  if (!apiKey) return [];

  const res = await fetch(`${BASE}/posts?limit=${limit}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zernio list failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json().catch(() => ({}))) as { posts?: RawZernioPost[] };
  const raw = Array.isArray(data.posts) ? data.posts : [];
  return raw.map(normalizePost);
}

// Documented at https://docs.zernio.com/core — DELETE /posts/<id>.
export async function deletePost(id: string): Promise<void> {
  if (!apiKey) throw new Error("Zernio not configured");

  const res = await fetch(`${BASE}/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zernio delete failed (${res.status}): ${text.slice(0, 300)}`);
  }
}
