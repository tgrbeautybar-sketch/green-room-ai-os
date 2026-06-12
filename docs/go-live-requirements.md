# Green Room AI OS — Go-Live Requirements

What it actually takes to move each module from **demo** to **real**, and exactly what we need **from Belinda & Joe** vs. what **we (Prime)** build.

**Where we are today:** Everything runs on seeded demo data. The *only* live integration is **Claude** (Anthropic) — it already drafts captions and rewrites rent reminders. Every other connection (publishing, bank, voice, SMS) is stubbed behind a "live-ready shape," so flipping each one on is config + credentials + wiring, not a rebuild.

**Legend:** 🟢 done · 🟡 needs setup · 🔴 blocked on the client · ⏳ has a real lead time

---

## Module 1 — Post Studio (Social)

**What it does live:** Belinda picks a post type, the agent drafts the caption in the Green Room voice, she approves, and it schedules to Instagram + Facebook.

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Caption drafting | Claude (Anthropic) | 🟢 | Live now. Our key. |
| Publishing to IG + FB | **Zernio API** (decided) | 🟢 code / 🔴 creds | Integration **built** (env-gated). Goes live once creds are set. |

**Why Zernio, not Buffer or Meta:** Buffer's API is now closed to new apps (can't register / get a client_id). Meta direct is free but needs an app + review. **Zernio** is a unified posting API whose **free tier covers 2 accounts** — exactly Belinda's IG + FB — with no app-review gauntlet. Cheapest + fastest automated path.

**Status — what's done:** `lib/social-publish.ts` + `POST /api/social/publish` call Zernio; the Post Studio "Schedule" button is wired to it. Without creds it cleanly returns demo mode; with creds it publishes for real.

**What we need from them (to flip it live):**
- A free **Zernio account**.
- **Instagram connected as a Business/Creator account** linked to a **Facebook Page** (Instagram's rule — a personal IG can't auto-publish), both connected in Zernio via OAuth.
- Three env vars on the deploy: `ZERNIO_API_KEY`, `ZERNIO_IG_ACCOUNT_ID`, `ZERNIO_FB_ACCOUNT_ID`.

**Remaining piece for IG *image* posts:** Instagram requires **publicly-hosted media URLs**. Right now uploaded images are in-browser previews (data URLs), which can't post to IG live. Caption-only posts to Facebook work; IG image posts need an image-hosting step (a small follow-up — upload to a bucket/Zernio media, pass the URL).

---

## Module 2 — Salon Dashboard

**What it does live:** One screen of *Belinda's* numbers — her own service revenue + her rent income — not the whole room's money (that belongs to the independent stylists).

| Piece | Provider | Status | Notes |
|---|---|---|---|
| Her booking/service revenue | **Vagaro API + webhooks** (preferred) *or* CSV export (fallback) | 🟡🔴⏳ | Vagaro **does** have a public API + a Transactions webhook → real-time revenue. Requires a paid plan w/ Vagaro CC processing; access activates in ~7 business days. |
| Bank / rent / deposits | **Plaid** | 🟡🔴⏳ | Production access ~3–5 business days to approve. |

**Vagaro integration option (recommended):** Vagaro now offers token-auth APIs (Appointments, Customers, Employees, Locations) and webhooks (Appointments, **Transactions**, Customers, etc.). The **Transactions webhook** streams her sales in real time — no CSV chore. ~$10/mo for 5,000 webhook calls. **CSV export stays as the no-cost fallback** if she'd rather not enable the API.

**What we need from them:**
- **Vagaro API access** on *her* account — requested in Settings → Developers → APIs & Webhooks (needs a paid plan + Vagaro credit-card processing, not free trial). ⏳ ~7 business days. *(Or, fallback: weekly CSV exports / her login.)*
- **Bank connection via Plaid Link** — she connects her business checking herself (secure, we never see the password).
- From the intake (§13): her definition of "her income," product/COGS %, what a good week looks like.

**What we build:** Vagaro webhook receiver + token API client (with CSV importer as fallback), Plaid integration, metric calculation.

**Accuracy flag:** The Vagaro API is **per-account**. Because we scoped the dashboard to *Belinda only*, we just need *her* account's token — clean. We do **not** need the other 11 stylists' data (it isn't hers to pull, and each has a separate account). This keeps the dashboard far simpler than a multi-tenant version.

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
6. **Zernio** (free) account with their **IG (Business/Creator)** + **FB Page** connected → API key + the 2 account IDs. *(Social — integration already built, just needs creds)*
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
