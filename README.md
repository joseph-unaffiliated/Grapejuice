# Grapejuice — Hanukkah 2026 pilot

Curated Hanukkah box app for the December 2026 pilot. **Grapejuice** in-product; Untraditional only as parent brand in legal/store copy if needed.

The **commerce app is preserved** at [`../app/`](../app/) — do not edit it for pilot work unless intentionally syncing shared tokens.

| | Pilot (`pilot-app/`) | Commerce (`../app/`) |
|---|----------------------|----------------------|
| Expo slug | `grapejuice-pilot` | `grapejuice` |
| Bundle ID | `app.grapejuice` | `app.grapejuice` |
| Firebase | **New** project (`grapejuice-pilot` placeholder) | `untraditional-commerce` |

> **Dev note:** Same bundle ID means you cannot install both native builds on one device simultaneously. Use Expo Go or alternate simulators.

## Setup

This repo **is** the Hanukkah pilot app (`pilot-app` in Joseph's Dropbox monorepo). There is no nested `pilot-app/` folder here — run commands from the repo root.

```bash
cd Grapejuice   # repo root
npm install
cp .env.example .env
# Create Firebase project → paste EXPO_PUBLIC_FIREBASE_* into .env
npx expo start
```

Sign in with email or Google (no dev bypass in production builds).

## Family profiles *(deferred — tablet / post-pilot)*

Build 8 ships a **parent-only shell** (`PILOT_PARENT_ONLY` in `src/constants/pilotFeatures.ts`). Kid profiles, voting, wrapped gifts, and kid Rav are implemented but hidden for the Hanukkah 2026 pilot.

When re-enabled:

- **Profiles** — reached from Account; tap a child to enter kid theme
- **Thumbs-up voting** on story/gift picks (kids + grown-ups); long-press to see who voted
- **Wrapped gifts** — parents hide gift options from kids until Hanukkah
- **Kid Rav** — optional per child (`Allow Rav` on Profiles); server-enforced limits (no box changes)

## What's in this scaffold (Phase A)

- [x] Expo 54 + TypeScript + DM Sans
- [x] Parent / kid theme tokens (`themeMode.ts`, `ThemeContext`)
- [x] 5-tab navigation shells (Home, My Box, Rav, Account — Guide hidden for pilot)
- [x] Auth welcome shell (email + Google)
- [x] Firebase / Functions / rules **stubs** (wire new project before real data)
- [x] Types stub (`src/types/pilot.ts`)
- [ ] Real auth, box engine, Stripe webhook, Customer.io, Rav tools — Phase B+

## Docs

- [**Start here — Brendan's Cursor agent**](./docs/starthere-brendansagent.md)
- [Technical brief](./docs/GRAPEJUICE_TECHNICAL_BRIEF.md)
- [Pilot spec](./docs/PILOT_SPEC.md)
- [Commerce baseline](./docs/COMMERCE_BASELINE.md)
- [Pilot decisions questionnaire](./docs/PILOT_DECISIONS.md)
- [E2E test matrix](./docs/E2E_TEST_MATRIX.md)
- [Figma design inventory](./docs/FIGMA_DESIGN_INVENTORY.md)
- [Stripe setup / account switch](./docs/STRIPE_SETUP.md)
- [Research panel → build backlog](./docs/RESEARCH_PANEL_BUILD_BACKLOG.md)

## Firebase

**Project:** `grapejuice-pilot` — https://console.firebase.google.com/project/grapejuice-pilot/overview

Already done: project + web app + `pilot-app/.env` with client config.

**You (one-time in Console):** Firestore → Create database (nam5). Storage → Get started. Auth → Email + Google.

Then:

```bash
npm run firebase:deploy:rules
npm run seed:pilot-content
```

Details: [docs/FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md)

## EAS

Create a **separate** EAS project for slug `grapejuice-pilot` when ready; do not overwrite commerce EAS without planning.
