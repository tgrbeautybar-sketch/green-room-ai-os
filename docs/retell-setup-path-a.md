# Retell Setup — Path A (Sage on a new number, transfers to Belinda)

Goal: Sage answers a NEW dedicated number, handles routine calls, **transfers to Belinda (978-308-9540)** when a human is needed, and **takes a message** (→ email + in-app inbox) otherwise. Belinda's Google Voice stays untouched.

> Retell's exact menu labels shift as they ship updates — the *concepts* below are stable; match them to what you see.

## Prereqs
- A Retell account (retellai.com).
- Our **Sage prompt** ready to paste — `docs/sage-retell-prompt.md`.
- Our **knowledge base** text — `docs/sage-knowledge-base.md`.
- For the "take a message" step only: the app **deployed to a public URL** (Retell can't call `localhost`). Answering + transfer work without it.

## Step 1 — Get Sage a phone number
- In Retell → **Phone Numbers** → buy a US number (or import a Twilio number). This becomes the salon's front-desk line.

## Step 2 — Create the agent "Sage"
- Create a new agent.
- **Voice:** pick a warm female voice; test it.
- **Begin Message** (first thing she says):
  > Thank you for calling The Green Room Beauty Bar! This is Sage — how can I make your day beautiful today?
- **Prompt / General Prompt:** paste the full prompt from `sage-retell-prompt.md`.
- **Knowledge base:** if Retell offers a Knowledge Base attachment, paste/upload `sage-knowledge-base.md`. (If not, the prompt already contains the essentials.)

## Step 3 — Human transfer (caller wants a person)
- Add a **Call Transfer** function/node to the agent.
- **Destination:** `978-308-9540` (Belinda).
- Trigger: when the caller asks for a person, has a complaint, or Sage can't help.
- **Fallback:** if the transfer isn't answered, fall back to "take a message" (Step 4) so nothing drops.

## Step 4 — Take a message (booking / after-hours / no answer)
- Add a **Custom Function** (webhook tool) the agent can call, e.g. `save_message`.
- **Method/URL:** `POST  https://<YOUR-DEPLOYED-APP>/api/hooks/voice-message`
- **Header:** `x-webhook-secret: <the VOICE_WEBHOOK_SECRET you set on the app>`
- **Body fields the function should send:**
  ```json
  { "type": "booking" | "message",
    "callerName": "...", "phone": "...",
    "service": "...", "preferredStylist": "...", "note": "..." }
  ```
- Result: the message is stored and emailed to Belinda automatically (the app side is already built).

## Step 5 — Wire it together
- Assign the **Sage agent** to the number from Step 1 (inbound calls → Sage).
- Behavior: during the day, offer to transfer to a human; after hours or no answer, take a message. (Keep it simple — Sage offers the transfer, falls back to message.)

## Step 6 — Test
- Call the new number. Confirm: greeting plays → ask a question (she answers from the KB) → ask for a person (transfers to 978-308-9540) → leave a booking (check Belinda's email + the Front Desk **Inbox** card).

## After it works — go live
- Put the **new number** on the website, Google Business Profile, and booking page as the salon's contact number.
- Belinda's existing number stays hers, untouched; clients who already have it still reach her directly.

## Nice-to-have (later)
- Sage can **text the booking link during a call** using Retell's SMS-approved number pool — **no A2P needed** for during-call texts. Turn this on once the basics are solid.
