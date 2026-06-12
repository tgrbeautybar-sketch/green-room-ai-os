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
- Open Post Studio → pick a post type → review the AI caption → **Schedule**.
- The button reports **live** (vs demo). Confirm the post lands on Facebook (and Instagram once Step "image hosting" below is done).

## Remaining piece on our side — Instagram images
Instagram requires images to be at a **public web URL**. Right now uploaded images are in-browser previews (data URLs) that IG can't fetch, so:
- **Facebook text posts work now.**
- **Instagram image posts** need an image-hosting step (upload the image to storage → pass the public URL to Zernio). That's a small build I owe — flagging it so it's not a surprise.

## Summary — what's needed from whom
| Item | Who |
|---|---|
| IG = Business/Creator + linked FB Page | Belinda (you guide her) |
| Free Zernio account + connect IG/FB | You |
| API key + 2 account IDs → env vars | You |
| Image hosting for IG image posts | Me (build) |
| Caption drafting | ✅ already live (Claude) |
