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

```bash
cd pilot-app
npm install
cp .env.example .env
# Create Firebase project → paste EXPO_PUBLIC_FIREBASE_* into .env
npx expo start
```

Use **Dev: enter app** on sign-in, then **Theme: parent/kid** (top-right) to preview kid dark mode until child auth exists.

## What's in this scaffold (Phase A)

- [x] Expo 54 + TypeScript + DM Sans
- [x] Parent / kid theme tokens (`themeMode.ts`, `ThemeContext`)
- [x] 5-tab navigation shells (Home, My Box, Rav, Guide, Account)
- [x] Auth welcome shell + dev bypass
- [x] Firebase / Functions / rules **stubs** (wire new project before real data)
- [x] Types stub (`src/types/pilot.ts`)
- [ ] Real auth, box engine, Stripe webhook, Customer.io, Rav tools — Phase B+

## Docs

- [Pilot spec](../docs/PILOT_SPEC.md)
- [Commerce baseline](../docs/COMMERCE_BASELINE.md)

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
