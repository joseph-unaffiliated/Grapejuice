# Grapejuice — Technical Brief

**Product:** Grapejuice (by Untraditional)  
**Domain:** [grapejuice.co](https://grapejuice.co)  
**Pilot focus:** Hanukkah 2026 — curated holiday boxes, digitally customized, shipped to the door  
**Document status:** March 2026  
**Audience:** Internal stakeholders, recruiting partners, and technical collaborators  

---

## Executive summary

Grapejuice is Untraditional’s holiday product: a curated box of objects, rituals, and guidance designed to help families actually practice Jewish holidays the way they wish they did. The barrier is friction, not ideology — so the product delivers everything a family needs for a holiday to their door, personalized to their household, with an AI companion called **Rav** to help them customize and engage.

The Hanukkah 2026 pilot is built as a single **Expo application** (`pilot-app/`) backed by Firebase project **`grapejuice-pilot`**, with a live web prototype at [grapejuice.co](https://grapejuice.co). Bundle ID: `app.grapejuice`.

The parent self-serve journey — explore, onboard, build a box, customize with Rav, save a card, commit to ship — is **largely implemented** on web. Major gaps before a real pilot launch include **grandparent gifting**, **fulfillment integration (ShipStation)**, **SMS/reminder automation**, **native App Store distribution**, and **ops polish** on several screens still marked work-in-progress in design inventory.

Phase 2 success (June–December 2026) is measured less by scale than by depth: **20–50 pilot families** in the Northeast (Boston–DC corridor), **250+ waitlist signups** as market signal, and debrief data on behavior change, personalization value, and repurchase intent for Passover 2027 / Hanukkah 2027.

---

## Table of contents

1. [Product context](#1-product-context)
2. [System architecture](#2-system-architecture)
3. [Technology stack](#3-technology-stack)
4. [Data model](#4-data-model)
5. [Third-party integrations](#5-third-party-integrations)
6. [Main user flows](#6-main-user-flows)
7. [What is built (Hanukkah 2026 pilot)](#7-what-is-built-hanukkah-2026-pilot)
8. [What remains — current phase (Hanukkah 2026 pilot)](#8-what-remains--current-phase-hanukkah-2026-pilot)
9. [What remains — future phases](#9-what-remains--future-phases)
10. [Build sequencing](#10-build-sequencing)
11. [Deployment and operations](#11-deployment-and-operations)
12. [Evaluation metrics (Phase 2)](#12-evaluation-metrics-phase-2)
13. [Relationship to the broader Untraditional ecosystem](#13-relationship-to-the-broader-untraditional-ecosystem)
14. [Appendix: repository layout](#appendix-repository-layout)

---

## 1. Product context

### 1.1 The problem

Families want to mark holidays meaningfully but face too much friction: sourcing objects, knowing what to do, coordinating across household members, and following through. Grapejuice removes that friction by shipping a curated, customizable box and supporting the experience digitally.

### 1.2 The pilot hypothesis

The Hanukkah 2026 pilot tests whether the **end-user experience creates real impact** — not whether logistics or commercial viability work at scale. Key questions:

- Do families actually use the box?
- Does personalization justify the operational complexity?
- Does the experience feel different from “going through the motions”?
- Would families come back for Passover or next Hanukkah?
- Does it resonate across multiple audience archetypes (the “70%”)?

### 1.3 Pilot scope (business)

| Parameter | Target |
|-----------|--------|
| Pilot households | 20–50 families |
| Geography | Northeast US, Boston–DC corridor |
| Waitlist signups | 250+ (market signal) |
| Ship window | Before Hanukkah 2026 (holiday starts December 5, 2026) |
| Box price (pilot) | $50 (list price $80) |
| Shipping | Free standard US shipping for pilot |

### 1.4 Locked product decisions (engineering-relevant)

| Topic | Decision |
|-------|----------|
| Brand in UI | “Grapejuice” only; Untraditional appears in legal/metadata only |
| Navigation | 3 tabs: **Home**, **Rav**, **Account** (no separate “My Box” tab — Home is the box hub) |
| Marketplace browse | No open marketplace for Hanukkah; curated catalog only |
| Customization lock | Fixed calendar lock date per holiday (config-driven) |
| Payment model | Card on file = commitment; **charge at lock** (one off-session PI after customization; not at commit) |
| Swap gate | Users may browse swaps without a card; mutations require card on file or gift credit |
| Rav authority | Rav may change box state; Rav **cannot** confirm or charge orders |
| Kid experience (pilot ship) | **Parent shell only** — kid profiles, voting, kid Rav UI exist in code but are hidden |
| In-app Hanukkah guide | **Print-only in box** — in-app guide routes hidden for pilot |
| Grandparent gifts | $50; grandparent enters ship address; recipient confirms; magic link never expires |
| Fulfillment | ShipStation (planned) |
| Email | Customer.io transactional |
| SMS | Customer.io SMS (planned) |
| Platforms | iOS, Android, and web via Expo |

---

## 2. System architecture

### 2.1 Pattern

Grapejuice pilot is a **client + Firebase BaaS** architecture — not a custom API server or microservices layer. The Expo app talks directly to Firebase Auth and Firestore; privileged operations (Stripe, Rav AI, email, order commits) run in **Firebase Cloud Functions**.

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Expo)                            │
│   iOS · Android · Web (react-native-web)                    │
│   Zustand stores · React Navigation · AsyncStorage (guest)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│      Firebase Auth        │    │      Cloud Firestore         │
│  Email · Google · Apple   │    │  Users · Households · Orders │
└──────────────────────────┘    │  Catalog · Config · Rav chats │
               │                 └─────────────────────────────┘
               ▼                              ▲
┌──────────────────────────┐                 │
│   Cloud Functions (Node)  │─────────────────┘
│   Stripe · Rav · Email    │
│   Order commit · Webhooks │
└──────────────┬───────────┘
               │
     ┌─────────┼─────────┬──────────────┐
     ▼         ▼         ▼              ▼
  Stripe   Anthropic  Customer.io   (ShipStation —
  payments  Claude     email         planned)
```

### 2.2 Security model

- **Firestore rules** enforce household membership for box drafts and orders.
- **Orders are write-protected** — only Cloud Functions may create or update order documents after commit.
- **Rav** runs server-side with catalog context; client applies structured “draft actions” returned by the model.
- **Guest sessions** live in device AsyncStorage until the user creates an account; guest box state merges into the household on signup.

---

## 3. Technology stack

### 3.1 Application (`pilot-app/`)

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | Expo ~54, React Native 0.81, React 19 | New Architecture enabled |
| **Web** | react-native-web | Single codebase; deployed to Firebase Hosting |
| **Language** | TypeScript ~5.9 | Strict typing throughout |
| **Navigation** | React Navigation 7 | Stack + bottom tabs |
| **State** | Zustand 5 | Auth, guest session, dev preview |
| **Forms** | react-hook-form 7 | Checkout, onboarding |
| **Fonts** | DM Sans via Expo Google Fonts | Display: ITC Avant Garde (Typekit on web) |
| **Icons** | Font Awesome 6/7 | |
| **Auth** | Firebase Auth 12 | Email/password, Google, Apple (iOS) |
| **Database** | Cloud Firestore | Region: `nam5` (US) |
| **Storage** | Firebase Storage | Asset rules deployed |
| **Serverless** | Cloud Functions v2 | Node 20 |
| **Payments** | Stripe | SetupIntent (save card) + off-session PaymentIntent at lock; `@stripe/stripe-react-native` on native, `@stripe/react-stripe-js` on web |
| **AI** | Anthropic Claude | Model: `claude-sonnet-4-20250514`; structured JSON responses for Rav |
| **Email** | Customer.io transactional API | Order confirmation, partner invites |
| **Hosting** | Firebase Hosting | Site `grapejuice-pilot` → `dist/` SPA; custom domain grapejuice.co |
| **Mobile builds** | EAS (Expo Application Services) | Profiles: development, preview, production |
| **Design QA** | Playwright + pixelmatch | Figma screenshot comparison scripts |

### 3.2 Environment and secrets

**Client (`.env`):**
- `EXPO_PUBLIC_FIREBASE_*` — Firebase web config
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

**Cloud Functions (Firebase / GCP secrets):**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `CUSTOMERIO_APP_API_KEY`, `CUSTOMERIO_FROM_EMAIL`, template IDs

---

## 4. Data model

### 4.1 Core Firestore collections (pilot)

| Collection / path | Purpose |
|-------------------|---------|
| `users/{uid}` | Profile, `householdId`, onboarding flags, Beam milestone hooks |
| `users/{uid}/children/{childId}` | Child profiles (ages, `ravEnabled`, `beamStatus`) |
| `users/{uid}/aiChats/{threadId}` | Rav conversation threads |
| `users/{uid}/reflection/{holidayId}` | Hanukkah debrief responses |
| `households/{id}` | Members, Stripe customer ID, card-on-file timestamp, gift credit balance |
| `households/{id}/boxDrafts/hanukkah-2026` | Line items, slot votes, lock state |
| `households/{id}/orders/{orderId}` | Order lifecycle, Stripe payment intent, tracking |
| `households/{id}/partnerInvites/{id}` | Co-parent invite codes |
| `catalog/hanukkah-2026/items/{itemId}` | SKU catalog (seeded) |
| `config/hanukkah-2026` | Lock date, holiday start, box price, estimated delivery |
| `config/passover-2027-waitlist` | Passover waitlist capacity |
| `content/hanukkah-2026/nights/{1-8}` | Print/ops reference (not in-app UI, not Rav context) |
| `waitlist/{entryId}` | Waitlist signups |

### 4.2 Key config defaults (seeded)

| Field | Value |
|-------|-------|
| Customization lock | November 7, 2026 (UTC) — 14 days before estimated delivery |
| Hanukkah start | December 5, 2026 |
| Estimated delivery | November 21, 2026 — 14 days before Hanukkah start |
| Box price | $50.00 (5000 cents; overridable in config) |
| Add-on extras | $5.00 flat per optional item |
| Tax | 7.5% at checkout |
| Shipping | $0 (free standard US) |

### 4.3 Order lifecycle

```
draft → committed → (charged at ship) → shipped → delivered
```

- **Committed:** Card saved via SetupIntent; order document created; no charge yet.
- **Charged:** Manual-capture PaymentIntent created and captured at fulfillment time (webhook confirms).
- **Gift credit:** `giftCreditCents` on household reduces amount due; grandparent purchase flow UI not yet built.

---

## 5. Third-party integrations

| Service | Pilot status | Role |
|---------|--------------|------|
| **Firebase** | Live | Auth, database, functions, hosting |
| **Stripe** | Live (test mode on prototype) | Save card at commit; charge at lock; webhooks |
| **Anthropic (Claude)** | Live | Rav AI — structured responses with product blocks and draft actions |
| **Customer.io** | Partial | Transactional email (order confirm, partner invite); skips gracefully if API key unset |
| **Google Sign-In** | Live on web | OAuth; native requires dev build |
| **Sign in with Apple** | Implemented (iOS) | App Store requirement when Google offered |
| **ShipStation** | **Code shipped** | `exportOrderToShipStation` after box charge; no-op without API keys; tracking via `writeOrderTracking` / webhook TBD |
| **Customer.io SMS** | **Not integrated** | Locked decision for reminders |
| **Hebcal** | Indirect | Holiday dates stored in app constants and seeded config |
| **Beam (sibling product)** | Schema hooks only | `birthdate`, `beamStatus`, nightly age-trigger function; no Beam UI in Grapejuice |

---

## 6. Main user flows

### 6.1 Guest explore

A visitor can use Grapejuice without an account.

1. **Welcome** — Choose “Explore Grapejuice,” “Build Hanukkah box,” or “Log in.”
2. **Explore** — Full Home experience; Account tab shows a sign-in badge.
3. **Rav** — Limited guest chat (no persistent Firestore thread); prompt to save after 2+ messages.

Guest box state persists in **AsyncStorage** until signup, then merges into the household.

### 6.2 Onboarding and box reveal

The core “magic moment” — from zero to a personalized box.

1. **Hanukkah intro** — Context for the pilot.
2. **Practices** — What the family already does.
3. **Children** — Names and ages (drives curation).
4. **Familiarity slider** — How comfortable the family is with holiday practice.
5. **Optional Rav question** — Open-ended input fed to curation.
6. **Building** — Animated spinner while the curation engine runs.
7. **Reveal** — Curated box presented; CTA to refine or proceed.

Signed-in users: state writes to Firestore (`households/.../boxDrafts/hanukkah-2026`).  
Guests: state in AsyncStorage.

### 6.3 Box customization

From **Home** or **My Box** (stack screen):

- View curated line items by category (story, ritual, gift, etc.).
- **Swap** items within slots until the lock date.
- **Add optional extras** ($5 each).
- **Payment gate:** browsing swaps is allowed without a card; selecting a swap triggers an alert and routes to Checkout if no card on file and insufficient gift credit.

**Rav customization:** Parent chats with Rav; model returns product blocks and draft actions (swap, add). Client applies mutations with toast feedback. Blocked after lock date.

### 6.4 Checkout (self-serve parent)

1. Guest with a built box hits Checkout → **auth gate** (create account / log in; draft preserved).
2. Order summary: $50 box + extras + 7.5% tax, free shipping.
3. US shipping address entry.
4. **Save card & commit to box** (Stripe SetupIntent) — or **Commit** if card already on file.
5. `commitPilotBox` Cloud Function creates order with status `committed` (card saved earlier via SetupIntent; **no charge**).
6. After `lockAt`, `scheduledChargePilotBoxes` / `chargePilotBoxOrder` charges final draft total; webhook confirms and exports to ShipStation.
6. **Order confirmation** — “Committed; you’ll be charged when we ship.”

No separate “confirm order” step — card on file equals commitment.

### 6.5 Rav (parent)

Four server-side modes (facilitator, personal shopper, project partner, facilitator_kid — kid mode hidden in pilot):

1. Starter chips or free-text message.
2. Claude returns JSON: prose + UI blocks (products, curations, swaps) + draft actions.
3. Client applies box mutations; shows thread history in Rav menu.
4. Rav cannot trigger checkout or payment.

### 6.6 Post-purchase lifecycle (Home)

Home UI adapts by **holiday phase** (countdown, pre-ship, shipped, during Hanukkah, post-Hanukkah):

| Phase | Home experience |
|-------|-----------------|
| Pre-lock | Customize box; countdown to lock date |
| Committed / pre-ship | Order status; delivery estimate |
| Shipped | Tracking (when available) |
| During Hanukkah | “Night X of 8” (print guide in physical box) |
| Post-Hanukkah | **Hanukkah debrief** CTA → reflection flow |
| Passover teaser | Waitlist card ($80 credit incentive documented; Stripe hold tabled) |

### 6.7 Hanukkah debrief

Multi-step reflection flow:

1. Which nights did you light / engage?
2. What worked? What didn’t?
3. One word to describe the holiday.
4. Repurchase intent (Yes / Maybe / No) + thank you.

Responses save to `users/{uid}/reflection/hanukkah-2026`. Incentive: **$80 Passover 2027 credit** (Firestore ledger; full Stripe balance application incomplete).

### 6.8 Partner household invites

Co-parent can invite a partner by email. Cloud Function sends Customer.io invite; partner accepts via code. Shared household and box draft.

### 6.9 Grandparent gift flow — **not built**

Designed in Figma (frames 16–17); engineering Build 2:

1. **Giver:** Enters recipient email, name, message, child ages, **shipping address**; pays $50.
2. **Recipient:** Receives never-expiring magic link; confirms address; sees gift message; enters box reveal without card if prepaid.
3. Expedited shipping and paid extras: recipient’s card if needed.

Backend support for `giftCreditCents` exists; UI and purchase flow do not.

### 6.10 Kid experience — **coded, hidden for pilot**

When `PILOT_PARENT_ONLY` is disabled (post-pilot):

- Profiles hub with per-child “Allow Rav.”
- Kid-themed UI on profile switch.
- Kid Rav (facilitator mode only — no box mutations).
- Slot voting (thumbs-up on story/gift options).
- Parent wraps gifts as surprises.

Deferred to tablet / post-pilot per Build 8 decision.

---

## 7. What is built (Hanukkah 2026 pilot)

### 7.1 Client application

| Area | Status | Notes |
|------|--------|-------|
| Welcome and auth (email, Google, Apple) | ✅ Built | Guest mode supported |
| Guest explore + session persistence | ✅ Built | AsyncStorage → account merge |
| Full onboarding stack | ✅ Built | Through box reveal |
| Box curation engine | ✅ Built | `buildDefaultBox`, catalog-driven |
| Home (phase-aware) | ✅ Built | Countdown, delivery, debrief CTA, Passover card |
| My Box customization | ✅ Built | Swaps, add-ons, lock date enforcement |
| Payment gate | ✅ Built | Card or ≥$50 gift credit required for mutations |
| Checkout (web + native) | ✅ Built | SetupIntent + commit flow |
| Order confirmation | ✅ Built | Charge-at-ship messaging |
| Rav chat (parent) | ✅ Built | Threads, draft actions, product blocks |
| Catalog product pages | ✅ Built | From Home rails and Rav blocks |
| Account (orders, invites, sign out) | 🟡 Partial | Core flows work; edit profile deferred |
| Hanukkah debrief / reflection | ✅ Built | Saves to Firestore |
| Partner invites | ✅ Built | Email via Customer.io |
| Web desktop shell | 🟡 Partial | `WebDesktopFrame`, sidebar nav at ≥1024px |
| Kid profiles, voting, kid Rav | ⏸ Coded, hidden | `PILOT_PARENT_ONLY = true` |
| In-app Hanukkah guide | ⏸ Hidden | `PILOT_HIDE_IN_APP_GUIDE = true` |
| Grandparent gift UI | ❌ Not built | Build 2 |
| Ala carte store grid | ⏸ Hidden | Screen exists; link suppressed |
| Push notifications | ❌ Not built | Conditional on App Store (Build 10) |

### 7.2 Backend (Cloud Functions)

| Function | Status | Role |
|----------|--------|------|
| `createPilotSetupIntent` | ✅ | Save card without charging |
| `commitPilotBox` | ✅ | Create committed order (no PI at commit) |
| `chargePilotBoxOrder` | ✅ | QA callable; force charge before lock |
| `scheduledChargePilotBoxes` | ✅ | Hourly batch after lockAt |
| `createPilotCheckout` | ✅ | Legacy immediate checkout (secondary) |
| `stripeWebhook` | ✅ | SetupIntent, PaymentIntent succeeded/failed |
| `askPilotRav` | ✅ | Claude with catalog context, 4 modes |
| `createPartnerInvite` / `acceptPartnerInvite` | ✅ | Household sharing |
| `scanBeamAgeTriggers` | ✅ | Nightly cron; Beam handoff schema |
| Customer.io email helpers | ✅ | Order confirm, partner invite |
| ShipStation integration | 🟡 | Export after charge; keys + inbound webhook pending |
| SMS reminders | ❌ | Planned |

### 7.3 Infrastructure

| Item | Status |
|------|--------|
| Firebase project `grapejuice-pilot` | ✅ Provisioned |
| Firestore rules + indexes | ✅ Deployed |
| Storage rules | ✅ Deployed |
| Firebase Hosting → grapejuice.co | ✅ Deployed |
| Catalog + config seed scripts | ✅ `npm run seed:pilot` |
| EAS config | ✅ `eas.json` exists; separate EAS project TBD for pilot slug |
| Figma compare / screenshot QA | ✅ Scripts in repo |

---

## 8. What remains — current phase (Hanukkah 2026 pilot)

These items are required or strongly recommended before serving 20–50 real families.

### 8.1 Product and engineering

| Item | Priority | Notes |
|------|----------|-------|
| **Grandparent gift flow (Build 2)** | High | Largely shipped — polish + QA in Testing column |
| **ShipStation fulfillment** | High | Code exports post-charge; **API keys + tracking webhook** pending |
| **Production Stripe** | High | Charge-at-lock shipped; **deploy + live keys** + `payment_intent.payment_failed` on webhook |
| **Customer.io production templates** | High | Order confirm, invites, debrief outreach |
| **SMS reminders (Customer.io)** | Medium | Locked decision; no code yet |
| **$80 Passover credit → checkout** | Medium | Firestore ledger exists; Stripe balance application incomplete |
| **Waitlist funnel** | Medium | Rules exist; full acquisition UX and ops workflow |
| **Design polish** | Medium | ~11 Figma frames still “Todo”; several screens “Partial” |
| **E2E test pass** | Medium | Matrix documented; full automated coverage incomplete |
| **Debrief outreach automation** | Medium | 2 email attempts → $20 Amazon fallback (ops process documented, not automated) |
| **Expedited shipping (Build 3)** | Low (deferred) | Flat fee at cost; later lock date |
| **Edit profile / notification prefs (Build 7)** | Low (deferred) | Display name, notification toggles |
| **Native App Store / TestFlight (Build 10)** | Medium | EAS profiles exist; Sign in with Apple required; push if shipped |
| **Passover card hold** | Tabled | Notify-only UI today |

### 8.2 Operations

| Item | Notes |
|------|-------|
| Warehouse / pack workflow | Outside app; must align with two lock dates if expedited ships |
| Pilot family selection | 20–50 from 250+ waitlist |
| Northeast shipping SLA | Standard ~10–14 days; expedited ~4 days when built |
| Support inbox | contact@grapejuice.co |
| Legal pages | Terms/privacy URLs locked to unaffiliated.co/network (adapt before store) |

### 8.3 Known prototype limitations

The live site at grapejuice.co is explicitly labeled **“Work in Progress”** on the recruiting portal. Expect:

- Incomplete grandparent flow
- Test-mode payments unless configured otherwise
- Some Home variants and desktop layouts not pixel-matched to Figma
- Kid features present in codebase but not accessible

---

## 9. What remains — future phases

### 9.1 Post-pilot Grapejuice (2027+)

| Capability | Description |
|------------|-------------|
| **Kid experience** | Enable profiles hub, kid Rav, voting, wrapped gifts (`PILOT_PARENT_ONLY = false`) |
| **In-app Hanukkah guide** | 8-night accordion for parents; tonight-focused view for kids |
| **Passover 2027 box** | Second holiday; waitlist → full product |
| **Expedited shipping tier** | Distance-based pricing long term |
| **Grandparent / gift expansion** | Beyond Hanukkah; gift messaging, scheduling |
| **Multi-holiday platform** | Reuse pilot patterns for Purim, Passover, High Holidays |
| **À la carte browsing** | Optional open catalog beyond curated box slots |
| **Membership / credits** | Subscription or credit balance for repeat holidays |
| **Push notifications** | Order updates, lock reminders, debrief prompts |

### 9.2 Platform integration (Untraditional ecosystem)

| Capability | Description |
|------------|-------------|
| **Shared Firebase project** | Migrate `grapejuice-pilot` → house-wide project (e.g. `untraditional-production`) so auth, profile, and Rav memory persist across Grapejuice, Beam, and future products |
| **Beam handoff** | Child `birthdate` and `beamStatus` schema + nightly trigger already stubbed; UI handoff when child approaches B'Mitzvah age |
| **Unified Rav** | Same companion across Grapejuice, Beam, and untraditional.io platform site |
| **unt raditional.io platform** | Public ecosystem site with Rav and beta opt-ins for future products (Shem, Hupa, Shiva, Rest, Moments) |

---

## 10. Build sequencing

Engineering builds are numbered in `PILOT_DECISIONS.md` and `FIGMA_DESIGN_INVENTORY.md`:

| Build | Scope | Status |
|-------|-------|--------|
| **1** | Core parent journey — onboarding, box, checkout, Rav | **Largely complete** |
| **2** | Grandparent gift flows | **Not started** |
| **3** | Expedited shipping tier | **Deferred** |
| **5** | Fulfillment integration, reminders | **Partial** (email only) |
| **7** | Edit profile, notification preferences | **Deferred** |
| **8** | Parent-only shell for pilot ship | **Active** (`PILOT_PARENT_ONLY`) |
| **9** | (Supporting polish) | In progress |
| **10** | App Store / TestFlight, push notifications | **Not started** |

**Recommended design completion order:** onboarding polish → checkout → home phase variants → gift frames when Build 2 begins.

---

## 11. Deployment and operations

### 11.1 Deploy commands (pilot)

```bash
cd grapejuice/pilot-app

# Seed catalog and holiday config
npm run seed:pilot

# Deploy security rules
npm run firebase:deploy:rules

# Deploy Cloud Functions
npm run firebase:deploy:functions

# Build web and deploy to grapejuice.co
npm run deploy:hosting
```

### 11.2 Hosting

- **Production URL:** https://grapejuice.co
- **Firebase site:** `grapejuice-pilot`
- **Output:** Expo web export → `dist/` (SPA)

### 11.3 Native distribution (when ready)

- **EAS** profiles: development, preview, production
- **Bundle ID:** `app.grapejuice`
- **Expo slug:** `grapejuice-pilot`

---

## 12. Evaluation metrics (Phase 2)

Phase 2 runs **June 1 – December 31, 2026**. Grapejuice success criteria from the Phase 2 proposal:

### 12.1 Primary assumptions and metrics

| # | Assumption | How we measure |
|---|------------|----------------|
| 1 | Product leads to **tangible behavior change** | Self-reported holiday practices this year vs. previous year (debrief survey) |
| 2 | **Personalization** justifies logistical complexity | Qualitative: what got used vs. what was skippable (debrief) |
| 3 | Impact **beyond going through the motions** | Qualitative: what feels different after the experience (debrief) |
| 4 | Opens a **recurring relationship** | Repurchase intent for Hanukkah 2027 and/or Passover 2027 (debrief) |
| 5 | Appeals to **multiple archetypes** of the 70% | Diverse 20–50 pilot households across Northeast |
| 6 | **Market interest** beyond pilot cohort | 250+ qualified waitlist signups |

### 12.2 Bonus metrics

- App Store downloads (if native ships)
- Passover 2027 waitlist signups
- Demand from outside Northeast corridor
- Press / word of mouth

### 12.3 Engineering timeline (from recruiting portal)

1. Curate and lock box SKU catalog  
2. Bring platform live (customization, Rav, ordering)  
3. Open waitlist; recruit 20–50 families  
4. Pack and ship before Hanukkah  
5. Collect debriefs and feedback  

---

## 13. Relationship to the broader Untraditional ecosystem

Grapejuice is one product in a planned house of offerings:

| Product | Role |
|---------|------|
| **Grapejuice** | Holidays — curated boxes |
| **Beam** | B'Mitzvah year platform |
| **Rest** | Shabbat (planned) |
| **Moments** | Everyday Judaica (planned) |
| **Shem, Hupa, Shiva** | Lifecycle moments (planned) |
| **Platform (untraditional.io)** | Ecosystem hub + shared Rav |

**Shared infrastructure vision:** One Firebase project, one family profile, one Rav memory — so a family’s preferences and relationship with the companion persist across products. Today Grapejuice pilot runs on isolated `grapejuice-pilot`; migration to a house-wide project is a **gate before Beam alpha**.

**Beam Stage 0 (complete in Grapejuice codebase):**
- Child `birthdate` and `beamStatus` on profiles
- Rav mode registry including `project_partner` stub
- Nightly `scanBeamAgeTriggers` Cloud Function

---

## Appendix: repository layout

```
grapejuice/
├── docs/
│   ├── PILOT_SPEC.md                   # Locked product spec
│   └── GRAPEJUICE_TECHNICAL_BRIEF.md   # This document
└── pilot-app/                          # Hanukkah 2026 pilot
    ├── src/                            # App screens, components, services
    ├── functions/                      # Cloud Functions (Stripe, Rav, email)
    ├── scripts/                        # Seed, Figma compare, deploy helpers
    ├── docs/                           # Decisions, E2E matrix, design inventory
    ├── firebase.json
    └── package.json
```

**Key reference documents:**

| Document | Path |
|----------|------|
| Product spec | `grapejuice/docs/PILOT_SPEC.md` |
| Locked decisions | `grapejuice/pilot-app/docs/PILOT_DECISIONS.md` |
| E2E test matrix | `grapejuice/pilot-app/docs/E2E_TEST_MATRIX.md` |
| Design inventory | `grapejuice/pilot-app/docs/FIGMA_DESIGN_INVENTORY.md` |
| Research panel backlog | `grapejuice/pilot-app/docs/RESEARCH_PANEL_BUILD_BACKLOG.md` |
| Phase 2 proposal metrics | `recruiting-portal/content/phase2-proposal.ts` |
| Beam integration | `Beam/Beam-Grapejuice-integration.md` |
| Firebase migration plan | `Beam/docs/firebase-migration.md` |

---

*This document reflects the codebase and locked decisions as of March 2026. For the live prototype, visit [grapejuice.co](https://grapejuice.co). For product questions, contact contact@grapejuice.co.*
