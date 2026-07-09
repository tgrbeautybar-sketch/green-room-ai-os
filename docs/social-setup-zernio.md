# Social Setup — Post Studio → Zernio (Instagram + Facebook)

Goal: Post Studio drafts captions in the Green Room voice (already live via Claude); Belinda approves; it **posts to Instagram + Facebook** automatically through Zernio (free tier = 2 accounts = exactly IG + FB).

> The publish code is built and env-gated — with no keys it stays demo; with keys it posts for real.

## Step 1 — Make the Instagram account postable (the one hard rule)
This is a **Meta rule**, not ours — no tool can post to a personal IG:
- Belinda's Instagram must be a **Business or Creator** account.
- It must be **connected to the salon's Facebook Page**.
- If it's currently personal: in the Instagram app → Settings → Account type → switch to Business/Creator (free, ~2 min), then link the Facebook Page. (Guide her on a screen-share.)

## Step 2 — Create a free Zernio account
- Sign up at zernio.com. The **free tier covers 2 social accounts** — IG + FB — which is all we need.

## Step 3 — Connect IG + FB in Zernio
- In Zernio, connect (OAuth) the **Instagram** account and the **Facebook Page**.
- Each connected account gets an **account ID** — note both (IG id, FB id).

## Step 4 — Get the API key
- In Zernio, grab the **API key** (Bearer token).

## Step 5 — Set 3 env vars on the app
```
ZERNIO_API_KEY=<the key>
ZERNIO_IG_ACCOUNT_ID=<instagram account id>
ZERNIO_FB_ACCOUNT_ID=<facebook account id>
```
That's the moment it flips from demo → live. No code change.

## Step 6 — Test
- Open Post Studio → pick a post type → review the AI caption → choose **Post now** or **Schedule for later** → publish.
- The button reports **live** (vs demo). Confirm the post lands on Facebook and Instagram.

## Instagram images — done
Instagram requires images to be at a **public web URL**. Uploaded images are hosted (Supabase Storage, or a local fallback in dev) before their URL is ever sent to Zernio, so:
- **Facebook text posts work.**
- **Instagram image posts work**, as long as the upload succeeds.

**The one hard rule this creates: IG posts are blocked unless the photo uploads.** Instagram will never accept a caption-only post. Post Studio enforces this on both sides:
- **Client-side**, before publishing: if Instagram is on and zero of the attached photos successfully hosted, the button is blocked with a plain notice ("Instagram needs a photo") offering **Try again** or **Post to Facebook only**. If *some* photos hosted and some didn't, it asks whether to post with the ones that worked or retry.
- **Server-side** (`POST /api/social/publish`), as a backstop: if Instagram is targeted with no media at all, it 400s with `"Instagram requires an image."` rather than letting a broken post through.

This exists because of a real incident: an earlier version silently skipped failed uploads, so Instagram posts went out with zero media and Zernio held them "pending" forever with no way to notice from the UI. The status view (below) now also flags any pre-existing post stuck in exactly that state.

## Scheduling for later
Post Studio has a "Post now" / "Schedule for later" toggle. Picking a date/time (labeled "salon time — New York") converts that naive value into a DST-correct ISO timestamp with an explicit UTC offset before sending it to Zernio along with `timezone: "America/New_York"`. Times in the past are rejected inline before you can submit.

## Post status view
The "History" section on Post Studio calls `GET /api/social/posts` (never a hard error — an unreachable Zernio returns a friendly retry message instead of a broken page) and groups posts into:
- **Needs attention** — anything that actually failed, or an Instagram post that's been "pending" for 10+ minutes with no media (i.e. stuck the way the incident above produced).
- **Upcoming** — scheduled, soonest first.
- **Posted** — published, newest first.

Each row can be removed via `DELETE /api/social/posts?id=...` (Zernio documents `DELETE /posts/<id>`), with an inline "Remove this? / Yes, remove / Keep" confirm.

## Summary — what's needed from whom
| Item | Who |
|---|---|
| IG = Business/Creator + linked FB Page | ✅ done |
| Free Zernio account + connect IG/FB | ✅ done |
| API key + 2 account IDs → env vars | ✅ done |
| Image hosting for IG image posts | ✅ done |
| Scheduling + status view | ✅ done |
| Caption drafting | ✅ already live (Claude) |
