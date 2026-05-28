# Green Room AI OS

Four AI tools for **The Green Room Beauty Bar** (Belinda + Joe), unified behind one Next.js app.

```bash
npm install
npm run dev
# open http://localhost:4321
```

## What's inside

| Route | Tool | What it does |
|---|---|---|
| `/` | **Overview** | One screen, live demo metric per tool |
| `/tools/social` | **Post Studio** | Pick post type → drop assets → agent drafts caption in Green Room's voice → schedule to IG + FB |
| `/tools/dashboard` | **Salon Dashboard** | Gross, net, retention, occupancy, rent roll. `View as` switcher in topbar filters every chart per-stylist. |
| `/tools/voice` | **Front Desk Agent** | Sage answers the phone, routes to the right stylist, books or warm-transfers. Replay scripted calls. |
| `/tools/rent` | **Friday Rent Roll** | Roster + Friday cycle, drafted reminders, "send" actions, 8pm summary card. |

API endpoints (consumed by the tool UIs): `/api/social/draft`, `/api/dashboard/metrics`, `/api/voice/sessions`, `/api/rent/roster`.

## Demo vs. live

Everything runs in **demo mode** — figures are deterministically modeled from a seeded RNG and labeled `Illustrative` in every UI. Same shape as the live data each tool will consume once integrations land:

| Tool | Live source |
|---|---|
| Post Studio | Anthropic Claude (caption draft) + Meta Graph API (publish) |
| Dashboard | Vagaro CSV export (no public API) + Plaid (bank/Venmo/Zelle) |
| Front Desk | Retell (voice agent) + per-stylist booking systems (Vagaro, Square, Millennium) |
| Rent Roll | Plaid (incoming payments) + Twilio (reminder SMS) |

Every page reads from `lib/demo/*` so the overview, dashboard, and rent roll never contradict each other.

## Layout

```
green-room-ai-os/
  app/
    page.tsx                 Overview
    layout.tsx               Shell (topbar + View-as)
    tools/social/            Tool 1
    tools/dashboard/         Tool 2
    tools/voice/             Tool 3
    tools/rent/              Tool 4
    api/                     Demo endpoints, live-ready shape
  components/
    shell/                   Topbar, ViewAsProvider
    ui/                      Card, Pill, Sparkline, Avatar
  lib/demo/                  Seeded deterministic data
  docs/superpowers/specs/    Design docs
```

## Out of scope (V2 add-ons)

Multi-tenant stylist auth · Real Vagaro API (closed — needs CSV import flow) · Live Plaid prod approval · Retell account/number provisioning · Cold-outreach stylist recruiting · Reddit visibility agent
