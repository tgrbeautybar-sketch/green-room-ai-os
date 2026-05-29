# Demo Script — Green Room AI OS

**Audience:** Belinda Reyes (owner) + Joe Reyes
**Date:** Thursday 2026-05-28, 3:15 PM ET
**Duration:** ~30 min · ~5 min demo, ~25 min discussion
**Channel:** WhatsApp video (Belinda's preference)

---

## Pre-call setup (T-5 min)

1. `cd C:\Users\PC\green-room-ai-os && npm run dev`
2. Open **http://localhost:4321** in Chrome, full screen, zoom 110%.
3. Open a second tab on `/api/health` — confirm `aiEnabled: true`.
4. Hard-refresh once so the carousel placeholders stop animating mid-demo.
5. Set "View as" in the topbar back to **Owner view (all stylists)**.
6. Wipe the test prompt: delete `.data/voice-prompt.txt` if it exists.
7. Have a phone with Belinda's salon photos handy (you'll drop one in live).

---

## Open (30 sec)

> "Belinda, Joe — good to see you. Last call you told us about social, the numbers, the phone, and Friday rent. Over the last few days we built the first cut of all four. I'll show you everything in five minutes, then we open it up. Sound good?"

Wait for the nod. Then share screen.

---

## Tool 1 — Post Studio (60 sec)

**Click:** Overview → tile labeled *Post Studio*.

> "This is what we'd give you instead of Meta Planner. Pick a post type, pick a stylist, drop an image."

1. **Click "Stylist Spotlight"** (default).
2. **Click Melissa's tab.**
3. **Click "+ Drop images"** → upload one real photo from your phone (Belinda will see it land in the carousel — that's the moment).
4. **Click "Re-draft ↻"**.
5. Pause. Let the caption land. Read the first line out loud.

> "That's Claude — Anthropic's model — writing in your voice. The system prompt knows the Green Room rules: no clichés, no emoji unless asked, short sentences. Every re-draft gives you a different angle. If you don't like one, you click again."

6. **Click "Tweak voice ↻"** once more so they see variance.
7. **Click "Schedule today 5:30 PM · IG + FB"**. The button locks to "Scheduled ✓".

> "Today that's a demo — when we wire Meta, it actually posts. The handoff from you is: tap the link, approve, done."

**Don't show:** the History card at the bottom (placeholder copy).

---

## Tool 2 — Salon Dashboard (75 sec)

**Click:** topbar → *Dashboard*.

> "One screen. Vagaro plus your bank. Right now it's modeled data labeled Illustrative — same shape we'll see once we get your CSV exports."

1. **Point at the four big numbers** — gross, net, bookings, retention.
2. **Click the "7d / 30d / 90d" toggle** — show the sparkline + leaderboard refilter.
3. **Click Melissa's row in the leaderboard.**

> "Now I'm looking at the salon from Melissa's chair. Same dashboard, her numbers. This is what we'd give her if she logs in — that's the recruiting hook Joe asked about."

4. **Click "← back to all stylists"** to reset.
5. Point at the rent-roll card on the right and the chair-occupancy bars below it.

> "Every chart on this screen reads from the same source — there's no version of this where the Overview number disagrees with the Dashboard number."

**Don't show:** the "View as" dropdown — let it surface naturally if they ask.

---

## Tool 3 — Front Desk Agent (60 sec)

**Click:** topbar → *Front Desk*.

> "This is the agent that answers your number. Twelve stylists, twelve booking systems, one phone tree."

1. **Click the first call** — Janet booking with Melissa.
2. Let the conversation render. Read one of Sage's lines.

> "Sage knows who Melissa is, what suite she's in, and that color requires a card on file. Caller doesn't have to know any of that."

3. **Click call 2** — open-intent caller, the "balayage who?" call.

> "Sage knows Ari does brighter, beachier work, and Melissa does softer dimensional. She picks. Sage routes."

4. **Scroll down to the system prompt editor.**

> "And this is where you'd tune her. Same way you'd train a new front desk person."

**Don't show:** the routing roster at the bottom unless they ask "what about the new stylist next month?"

---

## Tool 4 — Friday Rent Roll (60 sec)

**Click:** topbar → *Rent Roll*.

> "Last one. It's Friday 4:42 PM in demo time."

1. Point at the green progress bar.

> "Eight of twelve paid. Four outstanding. The agent's watched Venmo and Zelle all day."

2. **Click any outstanding stylist** — say Nadia.
3. Read the drafted reminder out loud.
4. **Click "warmer"** — wait two seconds.

> "That's Claude rewriting in your voice. Belinda — last call you said you hate being the one chasing people. Sage takes that off you."

5. **Click "Send to Nadia"** — button locks to "Sent ✓".
6. Scroll to the Friday-night summary card at the bottom.

> "And this is the WhatsApp you get at 8pm Friday. No tabs to check."

**Don't show:** the "firmer" tone unless someone asks — it lands different and we don't want to derail.

---

## Close (60 sec)

Stop sharing. Camera back on.

> "That's all four. Demo data today; here's what we need to make it real:
>
> 1. A Vagaro CSV export — even one week is enough to calibrate.
> 2. A Plaid connection to your business bank (we'll send a link, takes 90 seconds).
> 3. The phone number you want Sage to live on.
> 4. Twenty minutes with you to load images for the first month of posts.
>
> If we get those by Tuesday, the live cutover is one tool a day next week."

Then shut up. Let them talk.

---

## Anticipated Q&A

| If they ask… | Answer |
|---|---|
| *"Can other stylists log in?"* | "Today no — that's a V2 add-on. The View-as toggle is your demo of what their dashboard would look like. We can scope it if you want to lead with that as the rental pitch." |
| *"What if Vagaro changes something?"* | "We don't use the Vagaro API — they don't have one. We use the CSV export, which is stable. If they change the CSV columns, we adjust one file." |
| *"How much does the AI cost to run?"* | "Per post draft, fractions of a cent. Per rent reminder rewrite, the same. The voice agent is the one that adds up — ~7¢ per minute of call. We'll watch usage in the first month." |
| *"Can I edit Sage's prompt myself?"* | "Yes — you saw the editor on the Front Desk page. Save persists immediately." |
| *"What if I want a 5th tool?"* | "That's the bonus we promised if you make all four calls and get us access on time. Tell me what's missing." |
| *"Can we hand this off to a stylist instead of me?"* | "Yes — but only the Post Studio and the Dashboard. Rent Roll and Front Desk stay on you." |

---

## Things to NOT do during demo

- Don't open dev tools.
- Don't toggle "View as" via the topbar dropdown — use the leaderboard row click; it's the better story.
- Don't show the History card on Post Studio — placeholder copy reads "—".
- Don't click "firmer" on a rent reminder unless someone explicitly asks for harsher tone.
- Don't promise a live cutover date until they confirm the four things above.
- Don't bring up cost unless asked.

---

## After the call (within 1 hour)

- WhatsApp a thank-you to both, with a link to today's Loom (record the call).
- Push the demo branch + link them the URL (Railway deploy from `feat/v1-foundation`).
- Open a checklist note: Vagaro CSV · Plaid connect · Phone number · Image upload session.
- Sync to PM-PRIME with the four-item checklist as `todo`.
