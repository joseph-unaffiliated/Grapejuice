# Start here — Brendan's Cursor agent

**Audience:** Cursor agent working with Brendan (`brendan@unaffiliated.co`) on Grapejuice.  
**Human context:** Brendan has already read [vision.untraditional.io](https://vision.untraditional.io). Joseph is async — make reasonable decisions and document open questions; don't block on him for locked product rules.

---

## Your mission

Ship the **Grapejuice Hanukkah 2026 pilot** UI to production quality in two phases:

1. **Phase A — Figma (human-led):** Finish all pilot screens in Figma. Code is reference only.
2. **Phase B — Code (you):** Match Figma pixel-perfect in `grapejuice/pilot-app` using existing components, design tokens, and compare scripts.

**Out of scope unless Joseph explicitly says otherwise:** Beam (`Beam/`), legacy RN app (`untraditional-app/`), commerce app (`grapejuice/app/`), `jewish-life-platform/`, kid UI, in-app Hanukkah guide, ala carte store grid, desktop layouts (P2), App Store assets.

---

## Workspace layout

Brendan works from a **local copy** of the Untraditional folder (downloaded from Dropbox) or clones **GitHub:** `github.com/joseph-unaffiliated/Grapejuice`.

**Your working directory for all tasks:**

```
grapejuice/pilot-app/
```

**Brendan's GitHub clone:** repo root *is* pilot-app (`/Users/brendanfox/Code/Grapejuice`) — no nested `pilot-app/` folder. Run `npm run web` from there.

If the workspace root is the full Untraditional tree, ignore sibling folders unless asked.

| Path | Purpose |
|------|---------|
| `grapejuice/pilot-app/` | **Pilot app** — Expo 54, TypeScript, Firebase, Stripe |
| `grapejuice/pilot-app/docs/` | Product + design + ops docs (read these first) |
| `grapejuice/pilot-app/src/` | App source |
| `grapejuice/pilot-app/functions/` | Cloud Functions (Stripe, Rav, email, gifts) |
| `grapejuice/docs/GRAPEJUICE_TECHNICAL_BRIEF.md` | Architecture + build status |

**Source of truth for code:** GitHub. Dropbox is a bootstrap copy (includes `.env` files). Pull from git for updates; never commit `.env` or secrets.

---

## Read these docs before acting

| Priority | Doc | Why |
|----------|-----|-----|
| 1 | `docs/FIGMA_DESIGN_INVENTORY.md` | Master frame checklist, Figma node IDs, preview URLs, code file mapping |
| 2 | `docs/DESIGN_SYSTEM.md` | Typography, colors, shadows, buttons, spacing |
| 3 | `docs/PILOT_DECISIONS.md` | Locked product rules (charge-at-ship, pricing, scope) |
| 4 | `assets/visuals/BRAND_RULES.md` | Gold vs purple, accent usage |
| 5 | `docs/GRAPEJUICE_TECHNICAL_BRIEF.md` (parent folder) | System architecture, integrations |
| 6 | `.cursor/rules/grapejuice-pilot-design.mdc` | Cursor rule when editing `src/**` |

Reference as needed: `docs/STRIPE_SETUP.md`, `docs/FIREBASE_SETUP.md`, `docs/RESEARCH_PANEL_BUILD_BACKLOG.md`, `docs/E2E_TEST_MATRIX.md`.

---

## Product in one paragraph

**Grapejuice** helps secular/cultural Jewish families celebrate Hanukkah with a curated, customizable box shipped to their door. Parent-only for the pilot (`PILOT_PARENT_ONLY`). Users explore → onboard → get a curated box → refine swaps → save card → commit (charge at ship, not at checkout). AI companion **Rav** helps customize. Credits/pricing: ~$50 pilot box. Tone: warm, non-institutional, no assumed Jewish knowledge — see vision portal for audience ("the 70%").

---

## Local setup

```bash
cd grapejuice/pilot-app
npm install
cp .env.example .env   # only if .env missing — Joseph's Dropbox copy should already have .env
npm run web            # http://localhost:8081
```

**Requires `pilot-app/.env`** with `EXPO_PUBLIC_FIREBASE_*` (and Stripe/Google keys). File is gitignored; comes from Joseph's folder copy.

**Firebase project:** `grapejuice-pilot`  
**Live web:** https://grapejuice.co (Firebase Hosting) · https://grapejuice-pilot.web.app  
**Figma:** [Hanukkah pilot](https://www.figma.com/design/rGzXYb1rNVxqGHz81835Jn/) · file key `rGzXYb1rNVxqGHz81835Jn`

---

## Phase A — Figma work (Brendan)

Use **localhost preview URLs** as the side-by-side reference (substitute for Joseph walkthrough). Full list in `FIGMA_DESIGN_INVENTORY.md`.

```bash
npm run web
# Examples:
# http://localhost:8081/?preview=home
# http://localhost:8081/?preview=onboarding-intro
# http://localhost:8081/?preview=checkout
# http://localhost:8081/?preview=my-box
```

**Figma compare mode (stable Home hero copy):** open `?preview=home`, then in browser console: `localStorage.setItem('grapejuice-figma-compare','1')`

### Frame status (summary — see inventory for details)

**Done:** Home (no box), My Box, Rav welcome, Account guest, Gift giver/recipient (16–17).

**Todo / finish:** Welcome/auth (5), Onboarding 6–8, Box reveal (9 partial), Catalog (10), Rav thread (11 partial), Checkout (12), Order confirmation (13), Account signed-in (14 partial), Debrief (15).

**Variants on existing frames (not new artboards):** Home lifecycle on frame 1; My Box footer/guest/locked on frame 2.

**Skip:** Kid UI, in-app guide, store grid, voting, desktop 18–19, expedited shipping UI, edit profile, notification prefs.

### Figma conventions

- Mobile frames **390×844**
- Reuse components library (tab bar `366:1799`, search pill `366:1762`, etc.)
- Use **production copy** from inventory "Key copy & CTAs" table — source: `src/constants/pilotHolidays.ts`
- When a frame is done: note Figma **node ID** in inventory; optional PNG → `assets/mockup-refs/figma-{screen}.png`

### Recommended design order

1. Onboarding 6–9 + Checkout 12 + Order confirmation 13  
2. Home + My Box variants  
3. Rav thread, Catalog, Welcome/auth  
4. Account signed-in, Debrief  

---

## Phase B — Pixel-perfect implementation (you)

When Brendan marks a Figma frame ✅, implement in the mapped screen file (inventory appendix maps frame → `src/screens/...`).

### Design system in code

- Tokens: `src/constants/theme.ts`, `src/constants/designPresets.ts`
- Theme hook: `useThemeMode().colors` in UI (not static `semanticColors` except auth/onboarding)
- Primitives: `GrapejuiceButton`, `GrapejuiceCard`, `SearchPill`, etc.
- Font: **DM Sans** only
- Parent UI: Figma-light — white/cream surfaces, gold `#D8C990`, gold glow shadows
- Follow `.cursor/rules/grapejuice-pilot-design.mdc`

### Figma node comments (when matched)

```tsx
/** Figma rGzXYb1rNVxqGHz81835Jn — NODE_ID — Screen name */
```

### Pixel diff loop

```bash
# Export Figma frame → assets/mockup-refs/figma-{screen}.png
npm run compare:figma {screen}
# Home has dedicated script:
npm run compare:home
```

Playwright captures live screenshots; fix until diff is acceptable.

### Implementation rules

- **Minimal diffs** — match Figma; don't refactor unrelated code
- **Reuse components** — don't one-off styles per screen
- **Locked decisions** — if `PILOT_DECISIONS.md` covers it, follow it
- **Deferred features** — if inventory says 🚫 Deferred, don't build
- **Web-first** — pilot ships on web; native uses shared screens; web-specific: `*.web.tsx` (Stripe.js vs native SDK)

---

## Key code map

| Area | Path |
|------|------|
| Preview routing | `src/navigation/devPreview.ts`, `DevPreviewEffect.tsx` |
| Home | `src/screens/main/HomeScreen.tsx` |
| My Box | `src/screens/main/MyBoxScreen.tsx` |
| Checkout (web) | `src/screens/main/CheckoutScreen.web.tsx` |
| Rav | `src/screens/main/RavScreen.tsx`, `src/components/chat/PilotAIChatSheet.tsx` |
| Onboarding | `src/screens/onboarding/*`, `src/navigation/OnboardingStack.tsx` |
| Auth | `src/screens/auth/*` |
| Gifts | `src/screens/gift/*` |
| Feature flags | `src/constants/pilotFeatures.ts` |
| Copy | `src/constants/pilotHolidays.ts` |
| Box sections | `src/constants/boxDisplaySections.ts` |
| Admin catalog | `src/screens/admin/AdminCatalogScreen.tsx` (Brendan is in `ADMIN_EMAILS`) |

---

## Decision rules (Joseph is async)

| Situation | Action |
|-----------|--------|
| Covered in `PILOT_DECISIONS.md` | Implement as locked — no ask |
| Marked deferred in `FIGMA_DESIGN_INVENTORY.md` | Skip |
| Copy in inventory / `pilotHolidays.ts` | Use exactly |
| Copy missing | Pull from localhost preview; don't invent marketing voice |
| Ambiguous UX | Best judgment aligned with vision portal; leave Figma comment or short note for Joseph |
| Onboarding: Figma one scroll vs app 3 steps | Figma uses one scroll (frame 6); code may keep steps — don't block design on this |

---

## Access Brendan has

| Service | Use for Grapejuice |
|---------|-------------------|
| **GitHub** `joseph-unaffiliated/Grapejuice` | Code, PRs |
| **Firebase** `grapejuice-pilot` | Auth, Firestore, Functions, Hosting — needs **Editor** role to deploy |
| **Figma** Hanukkah pilot file | Design source of truth (Phase A) |
| **Dropbox copy** | Bootstrap + `.env` files |
| **Vercel** | **Not used for Grapejuice** — only untraditional.io / vision portal |
| **Twilio** | **Not used in pilot app** — SMS goes through Customer.io in Functions |

Stripe (Grapejuice account, test mode) is configured in local `.env` and deployed Functions. Webhook: `https://stripewebhook-xixzph7nrq-uc.a.run.app`. See `docs/STRIPE_SETUP.md`.

---

## Deploy (when Joseph asks or after agreed changes)

```bash
cd grapejuice/pilot-app

# Functions (Stripe, Rav, email — uses functions/.env.grapejuice-pilot)
npm run firebase:deploy:functions

# Web → grapejuice.co / grapejuice-pilot.web.app
npm run deploy:hosting

# Firestore rules only
npm run firebase:deploy:rules
```

Requires `firebase login` as Brendan. Do **not** deploy without confirming env files are correct. Never commit secrets.

---

## Testing checklist (after UI or payment changes)

1. `npm run build` (tsc) in `pilot-app/`
2. `npm run web` — walk preview URLs for changed screens
3. Sign in with email or Google (`localhost` must be Firebase authorized domain)
4. Checkout: test card `4242 4242 4242 4242` → household gets `cardOnFileAt` in Firestore
5. Stripe Dashboard → Webhooks → deliveries → 200 on `setup_intent.succeeded`
6. Optional: `npm run compare:figma {screen}`

---

## What not to do

- Don't edit `grapejuice/app/` (legacy commerce) for pilot work
- Don't enable kid features (`PILOT_PARENT_ONLY` stays true)
- Don't commit `.env`, service account JSON, or API keys
- Don't force-push `main` or change git config
- Don't deploy to production Stripe/live keys without Joseph
- Don't create new markdown docs unless asked (update existing inventory/status tables instead)

---

## Suggested first agent tasks

If Brendan hasn't started:

1. Read `FIGMA_DESIGN_INVENTORY.md` + run `npm run web`
2. Open Figma + `?preview=onboarding-intro` side by side
3. Phase A: complete onboarding frames 6–8 per inventory
4. Phase B (after Figma ✅): match `HanukkahIntroScreen.tsx` et al. to Figma; run compare when PNG exported

If Brendan returns to code:

1. Ask which frame(s) are ✅ in Figma
2. Implement pixel-perfect in mapped files only
3. Update status + node ID in `FIGMA_DESIGN_INVENTORY.md` when done

---

## Escalate to Joseph

- New product scope or pricing changes
- Firebase schema changes
- Production launch / live Stripe
- Customer.io template content
- ShipStation / fulfillment ops
- Anything contradicting `PILOT_DECISIONS.md`

---

*Last updated: June 2026 — Stripe account switched to Grapejuice test account; functions + hosting deployed.*
