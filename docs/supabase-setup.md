# Supabase Setup (for Vercel hosting)

The app persists state to **Supabase** when configured, and falls back to local files for dev. On Vercel (serverless, read-only filesystem) Supabase is **required** — without it, saves won't persist.

## 1. Create a Supabase project
At supabase.com → New project. Grab from Project Settings → API:
- **Project URL** → `SUPABASE_URL`
- **Secret key** (new format `sb_secret_...`, under "API keys → Secret keys"; or the legacy service_role key) → `SUPABASE_SECRET_KEY`. Server-only, never in the browser.
- Do NOT use the **publishable** key (`sb_publishable_...`) — that's the public/anon-equivalent; our code doesn't use it.

## 2. Run this SQL (Supabase → SQL Editor)
```sql
-- Key/value app state: knowledge base, Sage prompt, dashboard source
create table if not exists app_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Messages/bookings Sage captures
create table if not exists messages (
  id                text primary key,
  type              text not null,
  caller_name       text,
  phone             text,
  service           text,
  preferred_stylist text,
  note              text,
  received_at       timestamptz not null default now()
);
create index if not exists messages_received_at_idx on messages (received_at desc);

-- Lock both tables: with RLS on and no policies, only the SECRET key (which
-- bypasses RLS) can touch them. The publishable/public key gets zero access.
alter table app_state enable row level security;
alter table messages  enable row level security;
```
(We use the service_role key server-side only, so row-level security policies aren't required for these tables. Keep that key secret — never ship it to the browser.)

## 3. Create a public Storage bucket (for post images)
Supabase → Storage → New bucket:
- Name: **`post-media`** (or set `SUPABASE_BUCKET` to your name)
- **Public: ON** (Instagram must be able to fetch the image URL)

## 4. Environment variables (set in Vercel → Project → Settings → Environment Variables)
```
# Core
ANTHROPIC_API_KEY=...            # AI drafting (already have)
APP_PASSWORD=...                 # Belinda's login password
SESSION_SECRET=...               # any long random string

# Supabase (database + image storage)
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...              # the sb_secret_... key (NOT sb_publishable_...)
SUPABASE_BUCKET=post-media

# Social publishing (Zernio)
ZERNIO_API_KEY=...
ZERNIO_IG_ACCOUNT_ID=6a2b157a5f7d1751ab867bee
ZERNIO_FB_ACCOUNT_ID=6a2b16115f7d1751ab8688d3

# Email alerts (Resend)
RESEND_API_KEY=...
ALERT_EMAIL=...                  # Belinda's inbox

# Voice webhook security
VOICE_WEBHOOK_SECRET=...         # any long random string; also set in Retell's save_message header
```

## 5. Deploy
Push to GitHub → import the repo in Vercel → set the env vars above → deploy. The public URL Vercel gives you is what goes into Retell's `save_message` function.

## How the code chooses
- `lib/supabase.ts` builds the client only if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set.
- `lib/store.ts` (KB, prompt, dashboard source, messages) and `lib/storage.ts` (images) use Supabase when available, else local `.data/` for dev.
- So: no env = local files; full env = Supabase. Same code either way.

## Keep-alive (free tier auto-pause)
Supabase's free tier **pauses a project after 7 days with no activity** — which silently breaks the app on Vercel (Supabase configured = required, no local-file fallback there). `GET /api/health` does a tiny `app_state` read and is pinged **daily** by a `vercel.json` cron (`0 13 * * *`). The route is public (exempted from the login wall in `proxy.ts`, same as the webhook paths) so Vercel Cron can reach it without a session cookie, and it never throws — a paused project shows up as `"db": "unavailable"` in the response instead of a failed request. If the dashboard ever shows the project paused anyway, just open it in the Supabase dashboard to resume it once — the daily ping should keep it from happening again.
