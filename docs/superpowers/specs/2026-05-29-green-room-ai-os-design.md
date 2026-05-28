---
project: Green Room AI OS
client: The Green Room Beauty Bar (Belinda + Joe Reyes)
date: 2026-05-29
status: V1 scope locked, demo-first
---

# Green Room AI OS — Design

## Context

The Green Room is a chair-rental salon with ~12 independent stylists, all using different booking systems (Vagaro, Square, Millennium, manual). Belinda (owner) carries the work that doesn't pay per chair: social media, bookkeeping, phone routing, Friday rent collection. The salon was sourced through a $2k 4-tool 21-day engagement; first kickoff call was 2026-05-21, follow-up scheduled 2026-05-28 3:15pm ET, transcript and 4-tool brief delivered 2026-05-29.

## V1 scope (locked)

Four AI tools, one unified Next.js platform.

| # | Tool | Solves |
|---|---|---|
| 1 | **Post Studio**       | Belinda spending 10 hrs/wk in Meta Planner — drafts captions in Green Room's voice, builds carousel, schedules |
| 2 | **Salon Dashboard**   | Belinda can't read her own numbers — one screen with gross/net/retention/cost/rent/occupancy |
| 3 | **Front Desk Agent**  | Leads dying in Google Voice voicemail across 12 stylist numbers — Sage answers, routes, books or transfers |
| 4 | **Friday Rent Roll**  | Belinda manually chasing $3.6k/wk of chair rent — agent matches Friday bank/Venmo against roster, drafts nudges |

## Data strategy

**Demo-first, live-ready** (Norman Builders pattern). Every figure is deterministically modeled from a seeded RNG inside `lib/demo/*` and labeled `Illustrative` in every UI. Going live is per-tool and never changes the UI:

| Tool | Live source | Blocker |
|---|---|---|
| Post Studio | Anthropic Claude (caption draft) + Meta Graph API (publish) | Meta app review |
| Dashboard | Vagaro CSV export workflow + Plaid (bank/Venmo/Zelle) | Vagaro has no public API — CSV import flow needed; Plaid prod ~5 biz days |
| Front Desk | Retell + per-stylist booking systems (Vagaro, Square, Millennium) | Retell account + number provisioning; partial integrations per booking system |
| Rent Roll | Plaid + Twilio | Plaid prod approval |

Single source of truth for demo data: `lib/demo/stylists.ts`, `lib/demo/bookings.ts`, `lib/demo/payments.ts`, `lib/demo/calls.ts`, `lib/demo/captions.ts`. Overview metrics, Dashboard charts, and Rent Roll all read the same arrays so nothing contradicts.

## Architecture

```
green-room-ai-os/
  app/
    layout.tsx           shell — Topbar + ViewAsProvider, mobile-first
    page.tsx             Overview — one tile per tool with live demo stat
    tools/social/        Tool 1
    tools/dashboard/     Tool 2
    tools/voice/         Tool 3
    tools/rent/          Tool 4
    api/
      social/draft/      POST → caption (deterministic stub, Claude-ready)
      dashboard/metrics/ GET → window + stylistId-scoped metrics
      voice/sessions/    GET → scripted call list (Retell-ready shape)
      rent/roster/       GET → roster + Friday summary
  components/
    shell/Topbar.tsx     nav + "View as" switcher
    shell/ViewAsProvider client context for the View-as toggle
    ui/                  Card, Pill, Illustrative, Sparkline, BarRow, Avatar
  lib/demo/              seeded deterministic data
```

Stack: Next.js 16.2 · React 19.2 · Tailwind 4 (CSS-first `@theme`) · TypeScript 5 · no other runtime deps.

## "View as" — Gus's scope line honored

Gus told Belinda on the 2026-05-21 call that real multi-stylist auth was outside the $2k scope. The V1 "stylist view" is a UI toggle in the topbar that re-filters the same data — same dashboards, scoped per stylist, no auth infrastructure. Lets Belinda demo the recruiting hook ("each stylist gets their own dashboard") without us building tenancy. Documented V2 upgrade: magic-link sign-in for read-only stylist views.

## Visual identity

- Palette: deep botanical green (`--color-moss-700: #1F3D2E`) + champagne gold accent (`#C8A96A`) + cream surfaces (`#FAF7F1`). Distinctive, not generic SaaS slate.
- Type: Fraunces (display) + Inter (body) — editorial salon feel.
- Mobile-first: Belinda approves posts on her phone, so Post Studio + Dashboard work cleanly down to 360px.

## Out of scope (V2)

- Multi-tenant stylist auth + per-stylist password reset / settings
- Live Vagaro API integration (closed API — needs CSV import workflow or browser-automation scraper)
- Live Plaid prod (sandbox shape used in V1 demo)
- Retell account / phone-number provisioning + per-stylist booking-system adapters
- Cold-outreach stylist recruiting agent (deliverability risk discussed and deferred on the call)
- Reddit visibility / "show up in ChatGPT" agent (mentioned, parked)

## Risks

- **Vagaro is the dashboard blocker.** No public REST API. V1 demos with modeled data; live version will likely require Belinda exporting CSV weekly, or a headless scraper. Either way, contract is the same: `lib/providers/vagaro.ts` reads a normalized shape.
- **Plaid prod approval** ~5 business days. V1 demo uses Plaid sandbox shape; switch via env.
- **Retell cost** ~$0.07/min — flag for Belinda before live cutover; can swap to Vapi or Twilio+OpenAI.
- **One-hour build constraint** met by hard-deferring all live integrations and shipping with deterministic seeded data.

## Success criteria

- All 4 tool pages render + navigate, no console errors.
- "View as" switcher in topbar re-filters Overview + Dashboard live.
- Every illustrative figure wears the `Illustrative` pill.
- `npm run dev` boots on port 4321 with no compile errors.
- README documents the per-tool live-wiring path so Belinda's follow-up call can decide which to wire first.
