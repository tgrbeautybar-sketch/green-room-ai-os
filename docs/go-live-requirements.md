# Green Room AI OS — Go-Live Requirements

What it actually takes to move each module from **demo** to **real**, and exactly what we need **from Belinda & Joe** vs. what **we (Prime)** build.

**Where we are today:** Everything runs on seeded demo data. The *only* live integration is **Claude** (Anthropic) — it already drafts captions and rewrites rent reminders. Every other connection (publishing, bank, voice, SMS) is stubbed behind a "live-ready shape," so flipping each one on is config + credentials + wiring, not a rebuild.

**Legend:** 🟢 done · 🟡 needs setup · 🔴 blocked on the client · ⏳ has a real lead time

---

## Module 1 — Post Studio (Social)

**What it does live:** Belinda picks a post type, the agent drafts the caption in the Green Room voice, she approves, and it posts (or schedules) to Instagram + Facebook.

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Caption drafting | Claude (Anthropic) | 🟢 | Live now. Our key. |
| Publishing to IG + FB | **Zernio API** (decided) | 🟢 | Live — creds are set. |
| Image hosting for IG | Supabase Storage / local fallback | 🟢 | Uploaded images get a public URL before Zernio ever sees them. |
| Scheduling for later | **Zernio API** | 🟢 | "Post now" / "Schedule for later" toggle; New York time, DST-correct. |
| Post status view | **Zernio API** | 🟢 | History panel groups Needs attention / Upcoming / Posted. |

**Why Zernio, not Buffer or Meta:** Buffer's API is now closed to new apps (can't register / get a client_id). Meta direct is free but needs an app + review. **Zernio** is a unified posting API whose **free tier covers 2 accounts** — exactly Belinda's IG + FB — with no app-review gauntlet. Cheapest + fastest automated path.

**Status — what's done:** `lib/social-publish.ts` + `POST /api/social/publish` call Zernio; the Post Studio publish button is wired to it, plus `GET/DELETE /api/social/posts` for the status view. Without creds it cleanly returns demo mode; with creds it publishes for real.

**The one hard rule — IG posts are blocked unless the photo uploads.** Instagram will never accept a caption-only post, so Post Studio refuses to send one: if a photo was attached but failed to host, or none was attached at all, the button is blocked with a plain-language notice instead of silently going out broken (see `docs/social-setup-zernio.md`). This replaced an earlier bug where a failed image upload was silently skipped and the post went to Instagram with zero media, where it just sat "pending" forever.

**What we need from them (to flip it live):** already done — Zernio account created, IG connected as Business/Creator linked to the Facebook Page, and all three env vars (`ZERNIO_API_KEY`, `ZERNIO_IG_ACCOUNT_ID`, `ZERNIO_FB_ACCOUNT_ID`) are set.

---

## Module 2 — Salon Dashboard

**What it does live:** One screen of *Belinda's* numbers — her own service revenue + her rent income — not the whole room's money (that belongs to the independent stylists).

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Her booking/service revenue | **CSV export** (live today) *or* **Vagaro API + webhooks** (once approved) | 🟢🟡🔴⏳ | CSV upload is live now — no waiting. The Transactions webhook receiver is also live and reachable; it just has no Vagaro account to authenticate against until API access is approved (~7 business days, needs a paid plan + Vagaro CC processing). |
| Rent she collects | Venmo email scan (already live) | 🟢 | Unchanged — same `rent-roster` + `venmo-payments` data the Rent Roll tool uses; the dashboard's rent section reads it independently of the sales side. |
| Bank / other deposits | **Plaid** | 🟡🔴⏳ | Production access ~3–5 business days to approve. Not required for the dashboard to work today — rent is already covered via Venmo. |

**Status — what's done:** every sale (CSV import today, Vagaro webhook/API once creds land) normalizes into one sales ledger (`lib/transactions.ts`, migration in `docs/supabase-setup.md`). `lib/csv-import.ts` fuzzy-matches Vagaro's export column names so the upload works without a fixed schema. `lib/metrics.ts` computes gross, average ticket, top service, repeat-client rate, and an optional estimated-profit number (only if she enters a product/supply cost %) — all unit-tested. The dashboard shows sales as "Imported" (CSV) today, and will switch itself to "Vagaro connected" the moment `VAGARO_CLIENT_ID`/`VAGARO_CLIENT_SECRET` are set — no code change needed on our end when that day comes. See `docs/vagaro-setup.md` for her self-serve steps.

**What we need from them (to flip on the live connection — CSV works without this):**
- **Vagaro API access** on *her* account — requested in Settings → Developers → APIs & Webhooks (needs a paid plan + Vagaro credit-card processing, not free trial). ⏳ ~7 business days.
- Once approved: the Client ID, Client Secret, and Merchant ID Vagaro gives her (`docs/vagaro-setup.md` has the exact steps + webhook URL to register).
- Her product/supply cost % (optional, in the dashboard's own Settings panel) — only needed if she wants the estimated-profit tiles; sales-only works with nothing entered.

**Accuracy flags:**
- The Vagaro API is **per-account**. Because we scoped the dashboard to *Belinda only*, we just need *her* account's token — clean. We do **not** need the other 11 stylists' data.
- Vagaro's exact API base URL / token endpoint / transactions endpoint aren't independently confirmed yet (`lib/vagaro.ts` has them as named constants flagged TO-VERIFY) — the first real connection attempt once creds arrive should be treated as a smoke test.

---

## Module 3 — Front Desk Agent ("Sage")

**What it does live:** One salon number. Sage answers, pulls answers from the **knowledge base**, gives info, and either books, routes to the right stylist, sends a booking link, or takes a message. Now also handles **retail/product questions** when that part of the KB is filled in.

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Voice agent + phone line | **Retell** | 🟡🔴⏳ | Account + number; per-minute cost. |
| What Sage knows | **Knowledge Base** (new) | 🟡 | Upload/paste the filled intake; we build this panel next. |
| Booking | per-stylist systems (Vagaro API can write) | 🔴 | Vagaro has a create-appointment endpoint, but it's per-account — see flag. |

**What we need from them:**
- **The filled-in knowledge base** (the intake questionnaire — this *is* Sage's brain). Highest-value deliverable.
- A **phone-number decision:** one new salon number Sage answers (cleanest — replaces the "12 Google Voice numbers" mess), or port an existing one.
- **Per-stylist booking links** (the simple roster line from §4).
- A **booking-behavior decision:** should Sage (a) take the request + route to the stylist, or (b) attempt to book directly? Direct booking is limited by the 12 different systems.
- For **retail:** the products/brands they carry + gift-card details (intake §6.7, §9.3). If filled, Sage can recommend and sell; if blank, that ability stays off.
- **Escalation rules:** who Sage hands off to (Belinda vs Joe) and after-hours behavior (intake §10–11).

**What we build:** the Knowledge Base panel (upload file + paste, persists, wired into the agent), Retell agent config, routing logic, retail capability gated on KB content, escalation + after-hours flow.

**Accuracy flag:** Vagaro's create-appointment endpoint makes **direct booking possible — but per-account.** Belinda's own calendar can be booked directly; any *other* stylist needs to be on Vagaro AND grant their own API token (one each). Stylists on Square/Millennium/manual aren't covered. So realistic V1 = direct booking for Belinda (+ opt-in Vagaro stylists), route/send-link/take-message for everyone else. Full direct booking across all 12 is a per-stylist rollout, not V1.

---

## Module 4 — Friday Rent Roll

**What it does live:** Detects incoming rent payments, matches them to the roster, drafts reminders for who's outstanding, and sends them — so Belinda stops chasing.

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Detect incoming payments | **Plaid** | 🟡🔴⏳ | Same bank connection as the dashboard. |
| Reminder rewrites | Claude | 🟢 | Live now (tone: warmer/firmer/playful). |
| Send the reminder | **Twilio SMS** | 🟡🔴⏳ | Needs A2P 10DLC registration — real lead time. |

**What we need from them:**
- **Roster + rent terms:** each stylist's rent amount, due day, grace period, late fee (intake §14).
- Each stylist's **mobile number + consent to be texted**.
- **Preferred payment method** (Venmo / Zelle / cash / Square).
- **Bank connection via Plaid** (shared with the dashboard).
- **Reminder tone** preference, and who handles non-payment (Belinda or Joe).

**What we build:** Plaid payment-matching, Twilio sending, Friday scheduling, the 8pm EOD summary.

**Accuracy flags:**
- Matching **Venmo/Zelle** deposits to a specific stylist is fuzzy (memo lines vary) — expect a "confirm this match" step rather than 100% auto.
- **Twilio A2P 10DLC** (US business-texting registration) takes days–weeks and is required before SMS sends reliably. Start this early. ⏳

**Auto-remind (email) — live today, off by default:** Rent Roll now has an "Auto-remind unpaid renters" toggle that, once turned on, emails everyone still unpaid every Friday morning and follows up Monday morning — no clicking required. It reuses the same Venmo detection Rent Roll already has, so anyone Venmo already caught (fully or partially) is reflected before reminders go out.

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Scheduling | Vercel Cron (`app/api/cron/rent-cycle`) | 🟢 | Runs daily; the route itself only acts on Fridays/Mondays (New York time) — the schedule doesn't need day-of-week cron syntax. |
| Auth | Shared secret (`CRON_SECRET`) | ✅ | **Set on Vercel 2026-07-10.** Without it, the route fails closed (401) in production — reminders simply won't run, which is safe but silent. In dev, an unset secret is allowed through. |
| Sending | Same Gmail App Password as the manual "Email reminder" button | 🟢 | If Gmail isn't configured, the toggle still works but reminders can't send — the card says so plainly instead of pretending to have sent them. |
| Default state | Off | 🟢 | Nothing emails anyone until Belinda flips it on in Rent Roll. |

**What we need from them:** nothing new — it rides on the Gmail App Password already set up for the manual reminder button. **What we need to do:** set `CRON_SECRET` (any long random string) as an env var on Vercel and register the same value as the cron's bearer token (Vercel sets this automatically for its own scheduled invocations when the env var exists — see `vercel.json`).

---

## Cross-Cutting (applies to the whole platform)

| Need | Detail | Status |
|---|---|---|
| **Hosting** | Railway (our standard). Deploy + env vars + a subdomain. | 🟡 |
| **Domain** | A URL for the OS (e.g. `os.thegreenroom...`). | 🔴 from them |
| **Login / auth** | V1 is Belinda-only (we removed multi-stylist). Simple password or magic-link. | 🟡 decision |
| **Data store** | Demo uses seeded files. Live needs real storage for the KB, the saved prompt, imported CSVs, and matched payments. Likely Postgres on Railway. | 🟡 |
| **Secrets** | `ANTHROPIC_API_KEY` 🟢 · `BUFFER_ACCESS_TOKEN` · `PLAID_CLIENT_ID/SECRET` · `RETELL_API_KEY` (+ agent/number) · `TWILIO_SID/AUTH/FROM` (+ A2P). | 🟡 |

---

## The Short List — What We Need From Belinda & Joe

Grouped so they can act. The 🔴 items are the only true blockers.

**Decisions (5 min each):**
1. Phone number for Sage — new salon number, or port one?
2. Should Sage book directly, or take requests + route to the stylist? (We recommend route.)
3. Do they want retail/product selling through Sage? (If yes, fill the products section.)
4. Login — just Belinda for now? (We recommend yes.)
5. A domain/subdomain for the OS.

**Accounts & access:**
6. ~~**Zernio** (free) account with their **IG (Business/Creator)** + **FB Page** connected → API key + the 2 account IDs.~~ **Done** — Social posting (incl. scheduling) is live.
7. **Plaid** bank connection — Belinda links her business checking herself. *(Dashboard + Rent)* ⏳
8. **Vagaro** API access on her account (Settings → Developers; needs paid plan + CC processing) — gives real-time revenue + direct booking. CSV export is the fallback. *(Dashboard + Front Desk)* ⏳
9. **Retell** — we set up; confirm they're OK with per-minute voice cost. *(Front Desk)* ⏳
10. **Twilio** — we set up; **A2P 10DLC registration starts now** (longest lead time). *(Rent)* ⏳

**Content & data (the real homework):**
11. **The filled-in knowledge base** (intake questionnaire) — powers Sage + retail. *(Front Desk)* ← most important
12. Roster line per stylist: name / specialty / taking new clients? / booking link. *(Front Desk)*
13. Rent terms + each stylist's mobile + texting consent + payment method. *(Rent)*
14. Her "what counts as my income / a good week" answers. *(Dashboard)*

**Start-early because of lead time (⏳):** Plaid approval, Retell number, and especially **Twilio A2P registration**. Everything else can move fast once these are in flight.
