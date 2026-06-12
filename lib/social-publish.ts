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
