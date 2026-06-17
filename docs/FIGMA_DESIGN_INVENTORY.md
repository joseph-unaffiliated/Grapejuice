# Figma Design Inventory — Grapejuice Hanukkah Pilot

**Figma file:** [Hanukkah pilot](https://www.figma.com/design/rGzXYb1rNVxqGHz81835Jn/) · file key `rGzXYb1rNVxqGHz81835Jn`

This doc is organized for how you actually work in Figma: **~20 full mobile frames**, one **components library page**, and **variants** (copy/layout swaps — not separate frames). The old ~70-item checklist counted every component, state, and micro-interaction as its own row.

---

## Localhost preview

Start the web app: 

`cd /Users/joseph/Dropbox/Untraditional/grapejuice/pilot-app`

`npm run web` 

(default port **8081**, override with `EXPO_WEB_PORT`).

Each frame has a **preview URL** using the `?preview=` query param (web only). This seeds guest session state and navigates to the matching screen — useful for Figma side-by-side review.

**Base:** `http://localhost:8081`


| Preview key            | URL                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| *(default / no param)* | [http://localhost:8081/](http://localhost:8081/) — auth gate or last session state                                                                                      |
| Figma compare mode     | [http://localhost:8081/?preview=home](http://localhost:8081/?preview=home) + run `localStorage.setItem('grapejuice-figma-compare','1')` in console for stable hero copy |


Implementation: `src/navigation/devPreview.ts` · `DevPreviewEffect.tsx`

**Not previewable via URL (need real sign-in / data):**

- **Account — signed in** — log in on [account preview](http://localhost:8081/?preview=account), then use Google/email
- **Home — during / post / shipped** — depends on order + calendar; sign in after placing a test order, or mock in Firestore
- **Order confirmation** — use a real `orderId` after checkout: `?preview=order&orderId=YOUR_ORDER_ID`
- **Gift flows** — not built yet
- **Desktop** — same preview URLs at viewport ≥1024px

---

## At a glance


| Category                    | Count      | What it is                                                   |
| --------------------------- | ---------- | ------------------------------------------------------------ |
| **Frames (mobile screens)** | **~20**    | Full 390×844 (or your device) artboards                      |
| **Components library**      | **1 page** | Tab bar, pills, cards, rows — reused across frames           |
| **Variants**                | **~25**    | States on existing frames (hero copy, locked, guest banner…) |
| **Separate tracks**         | **4**      | App Store, legal, print — different files/deliverables       |
| **Skip for pilot**          | **4**      | Kid UI, in-app Guide, store grid, voting                     |



| Status          | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| ✅ **Done**      | Frame or component exists in Figma; node referenced in code |
| 🟡 **Partial**  | Started or implemented in app without full Figma coverage   |
| ⬜ **Todo**      | Needed for polished pilot                                   |
| 🚫 **Deferred** | Out of Hanukkah 2026 scope                                  |


---

## Simplified frame plan

Design these **full frames** (artboards). Everything else in the app is a **component** on these frames or a **variant** of one.

### Already done (4 frames + components on them)


| #   | Frame                  | Status | Figma node                 | Localhost preview                                                         | Code                   |
| --- | ---------------------- | ------ | -------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| 1   | **Home — no box**      | ✅      | `370:2949`                 | [localhost:8081/?preview=home](http://localhost:8081/?preview=home)       | `HomeScreen.tsx`       |
| 2   | **My Box — customize** | ✅      | `370:3514`, nav `370:3524` | [localhost:8081/?preview=my-box](http://localhost:8081/?preview=my-box)   | `MyBoxScreen.tsx`      |
| 3   | **Rav — welcome**      | ✅      | `366:1388`                 | [localhost:8081/?preview=rav](http://localhost:8081/?preview=rav)         | `PilotAIChatSheet.tsx` |
| 4   | **Account — guest**    | ✅      | `366:954`                  | [localhost:8081/?preview=account](http://localhost:8081/?preview=account) | `GuestAuthPrompt.tsx`  |


Frame 1 already contains most Home components (hero `370:3426`, My Boxes card `370:2995`, holiday row `370:3027`, catalog rails `384:487`, Set the Stage `370:3192`, Passover card `370:3396`, search `366:1762`, chips `370:2954`, tab bar `366:1799`).

---

### Still to design — core pilot (9 frames)


| #   | Frame                      | Status | Localhost preview                                                                                                                                                                                                         | Purpose                                                  | Code                                    |
| --- | -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| 5   | **Welcome / auth**         | ⬜      | [welcome](http://localhost:8081/?preview=welcome) · [sign-in](http://localhost:8081/?preview=sign-in) · [sign-in-email](http://localhost:8081/?preview=sign-in-email) · [sign-up](http://localhost:8081/?preview=sign-up) | Entry: explore, build box, or log in                     | `WelcomeScreen.tsx`, `SignInScreen.tsx` |
| 6   | **Onboarding — intro**     | ⬜      | [onboarding-intro](http://localhost:8081/?preview=onboarding-intro) · [practices](http://localhost:8081/?preview=onboarding-practices) · [box-intro](http://localhost:8081/?preview=onboarding-box-intro)                 | Set tone + explain box (Figma: one scroll; app: 3 steps) | `HanukkahIntroScreen.tsx`, …            |
| 7   | **Onboarding — household** | ⬜      | [household](http://localhost:8081/?preview=onboarding-household) · [familiarity](http://localhost:8081/?preview=onboarding-familiarity) · [rav](http://localhost:8081/?preview=onboarding-rav)                            | Children, familiarity, Rav question                      | `ChildrenScreen.tsx`, …                 |
| 8   | **Onboarding — building**  | ⬜      | [onboarding-building](http://localhost:8081/?preview=onboarding-building)                                                                                                                                                 | Wait state                                               | `BuildingBoxScreen.tsx`                 |
| 9   | **Box reveal**             | 🟡     | [onboarding-reveal](http://localhost:8081/?preview=onboarding-reveal)                                                                                                                                                     | Recap + item grid variants                               | `BoxRevealScreen.tsx`                   |
| 10  | **Catalog product**        | ⬜      | [catalog](http://localhost:8081/?preview=catalog&itemId=graphic-novel-hanukkah)                                                                                                                                           | Product detail from Home rails                           | `CatalogProductScreen.tsx`              |
| 11  | **Rav — chat thread**      | 🟡     | [rav-chat](http://localhost:8081/?preview=rav-chat)                                                                                                                                                                       | Conversation + product cards                             | `PilotAIChatSheet.tsx`                  |
| 12  | **Checkout**               | ⬜      | [checkout](http://localhost:8081/?preview=checkout) (shows auth gate until signed in)                                                                                                                                     | Payment & shipping                                       | `CheckoutScreen.tsx`                    |
| 13  | **Order confirmation**     | ⬜      | `?preview=order&orderId=…` after test checkout                                                                                                                                                                            | Post-commit success                                      | `OrderConfirmationScreen.tsx`           |
| 14  | **Account — signed in**    | 🟡     | Sign in via [account](http://localhost:8081/?preview=account)                                                                                                                                                             | Orders + household                                       | `AccountScreen.tsx`                     |
| 15  | **Hanukkah debrief**       | ⬜      | [debrief](http://localhost:8081/?preview=debrief)                                                                                                                                                                         | 4-step survey variants                                   | `ReflectionFlowScreen.tsx`              |


**Net new frames to design: ~11** (frames 5–15 minus partial progress on 9, 11, 14).

---

### Home lifecycle — variants on frame #1 (not new frames)

Use Figma **variants** on the Home frame (`370:2949`) or duplicate once for clarity — do **not** create 12 separate Home artboards.


| Variant               | Status | Localhost preview                                                    | What changes                                   |
| --------------------- | ------ | -------------------------------------------------------------------- | ---------------------------------------------- |
| **No box** (default)  | ✅      | [?preview=home](http://localhost:8081/?preview=home)                 | Full hero, empty My Boxes card                 |
| **Box started**       | 🟡     | [?preview=home-started](http://localhost:8081/?preview=home-started) | Compact hero (`388:347`), in-progress box card |
| **During Hanukkah**   | 🟡     | *(sign in + order during Hanukkah dates)*                            | Phase card: “Night X of 8”; print-guide copy   |
| **Post-Hanukkah**     | 🟡     | *(sign in + order after Hanukkah)*                                   | Debrief CTA + Passover card                    |
| **Ordered / shipped** | ⬜      | *(sign in + committed order)*                                        | Delivery timeline replaces hero                |
| **Signed-in**         | ⬜      | Same as home after login                                             | No Account tab badge                           |


Hero title swaps (Start → Refine → On its way → Arrived) are **text variants** on the hero component (`370:3426`), not new frames.

---

### My Box — variants on frame #2 (not new frames)


| Variant               | Status | What changes                                              |
| --------------------- | ------ | --------------------------------------------------------- |
| **Default customize** | ✅      | 5 sections, swap shelf, sticky nav                        |
| **No card on file**   | ⬜      | Payment-pending subhead + footer “Add payment & shipping” |
| **Card on file**      | ⬜      | Footer “Review shipping”                                  |
| **Guest view-only**   | ⬜      | Top banner: sign in to customize                          |
| **Locked**            | ⬜      | Lock banner, disabled swaps                               |
| **Swap shelf open**   | 🟡     | Expanded alternate grid on item row                       |


---

### When Build 2 ships (+2 frames)


| #   | Frame                | Status | Localhost preview | Purpose                                 |
| --- | -------------------- | ------ | ----------------- | --------------------------------------- |
| 16  | **Gift — giver**     | ⬜      | *Not in app yet*  | $50 purchase + grandparent ship address |
| 17  | **Gift — recipient** | ⬜      | *Not in app yet*  | Open link, confirm address, reveal box  |


---

### Optional P2 — desktop (+2 frames, or skip)

Engineering has `WebDesktopFrame.tsx`; pixel-perfect desktop is **not required** for pilot launch.


| #   | Frame                | Status | Localhost preview                                                | Notes                            |
| --- | -------------------- | ------ | ---------------------------------------------------------------- | -------------------------------- |
| 18  | **Desktop — Home**   | ⬜      | [home](http://localhost:8081/?preview=home) at width ≥1024px     | Sidebar nav + wider content      |
| 19  | **Desktop — My Box** | ⬜      | [my-box](http://localhost:8081/?preview=my-box) at width ≥1024px | Summary column + scroll sections |


---

## Components library (1 Figma page)

Design each **once** as a component; instance across frames. Not counted in the ~20 frame budget.


| Component                  | Status | Figma node                    | Used on                              |
| -------------------------- | ------ | ----------------------------- | ------------------------------------ |
| Tab bar                    | ✅      | `366:1799`                    | All tab screens                      |
| Search pill                | ✅      | `366:1762`                    | Home, Rav                            |
| Category chips             | ✅      | `370:2954`                    | Home header                          |
| Brand mark                 | ✅      | `366:1375`                    | Auth, Rav                            |
| Hero card                  | ✅      | `370:3426`, compact `388:347` | Home variants                        |
| My Boxes welcome card      | ✅      | `370:2995`                    | Home                                 |
| Holiday row                | ✅      | `370:3027`                    | Inside welcome card                  |
| Passover pre-register      | ✅      | `370:3396`, ring `370:3400`   | Home                                 |
| Catalog product rail       | ✅      | `384:487`–`497`               | Home                                 |
| Set the Stage cards        | ✅      | `370:3192`                    | Home                                 |
| Box item row + swap shelf  | 🟡     | —                             | My Box                               |
| Sticky section nav         | ✅      | `370:3524`                    | My Box                               |
| Guest auth prompt          | ✅      | `366:954`                     | Account, Checkout gate               |
| Grapejuice buttons / pills | 🟡     | —                             | See `DESIGN_SYSTEM.md`               |
| Rav curation card          | 🟡     | —                             | Rav thread                           |
| Delivery timeline card     | ⬜      | —                             | Home ordered variant                 |
| Design tokens              | 🟡     | —                             | Colors, type, shadows reference page |


---

## Variants & micro-states (do not design as frames)

These are **component variants**, **overlays**, or **dev annotations** — not separate artboards.


| Item                        | Parent               | Notes                                  |
| --------------------------- | -------------------- | -------------------------------------- |
| Payment-gate alert          | My Box, Rav, Catalog | Native alert copy — see Key copy below |
| Rav add/swap toast          | Rav thread           | Success feedback                       |
| Guest Rav sign-in chip      | Rav welcome          | After 2+ guest messages                |
| Filled search pill          | Home → Rav handoff   | Alignment change only                  |
| Loading / empty / error     | Any                  | Spinner + short copy                   |
| Checkout auth gate          | Checkout             | Reuses guest auth component            |
| Order confirmation pending  | Order confirmation   | Spinner variant                        |
| Expedited shipping selector | Checkout             | **Defer** until fee known (Build 3)    |
| Edit profile                | Account              | **Defer** (Build 7)                    |
| Notification preferences    | Account              | **Defer** (Build 7)                    |
| Legacy paid confirmation    | Order confirmation   | Unlikely path; skip unless needed      |


---

## Separate tracks (not in the ~20 app frames)

Different deliverables or files — not part of the mobile UI frame count.


| Track         | Items                                                       | When                          |
| ------------- | ----------------------------------------------------------- | ----------------------------- |
| **App Store** | App icon, 6.7″ / 6.1″ screenshots                           | Before TestFlight (Build 10)  |
| **Legal**     | Privacy + Terms pages (adapt unaffiliated.co URLs)          | Before App Store / web launch |
| **Print**     | Hanukkah night-by-night guide (`content/nights` is ops ref) | Warehouse parallel track      |
| **Desktop**   | Frames 18–19 above                                          | P2 optional                   |


---

## Deferred — do not design for pilot


| Screen                          | Reason                                         |
| ------------------------------- | ---------------------------------------------- |
| Kid Home / Kid Guide / Profiles | `PILOT_PARENT_ONLY`                            |
| In-app Hanukkah Guide           | Print-only (Q19)                               |
| Ala carte store grid            | Hidden; Home rails + product detail only (Q14) |
| Voting / wrapped gifts          | Tabled with kid features                       |


---

## Key copy & CTAs

Use in Figma so frames match production. Source: `src/constants/pilotHolidays.ts` (`PILOT_COPY`).


| Context                     | Copy                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Search pill placeholder     | Search or ask a question                                                                                            |
| My Box header               | **Refine your box**                                                                                                 |
| Payment-pending subhead     | Your box will not ship until you add payment information and a shipping address.                                    |
| Payment-gate alert          | **Add payment to customize** — Save a card to swap items and add extras. You won't be charged until your box ships. |
| Payment-gate CTAs           | Not now · **Add payment**                                                                                           |
| Checkout title              | Payment & shipping                                                                                                  |
| Charge-at-ship banner       | You won't be charged until your box ships.                                                                          |
| Checkout CTA (no card)      | Save card & commit to box                                                                                           |
| Checkout CTA (card on file) | Commit to box                                                                                                       |
| Order confirmation          | **Your box is committed.** — You won't be charged until your box ships. Keep customizing until the lock date.       |
| During Hanukkah (Home)      | Tonight's activities are in the Hanukkah guide in your box.                                                         |
| Post-Hanukkah Home          | Hanukkah debrief — unlock **$80 toward Passover** next year.                                                        |


**Hero titles (variants):** Start your Hanukkah Box · Refine your Hanukkah box · Your Hanukkah box is on its way · Your Hanukkah box has arrived

---

## Figma node quick reference


| Node                              | Component / frame              |
| --------------------------------- | ------------------------------ |
| `366:954`                         | Guest auth prompt              |
| `366:1375`                        | Brand mark                     |
| `366:1388`                        | Rav welcome                    |
| `366:1762`                        | Search pill                    |
| `366:1799`                        | Tab bar                        |
| `370:2949`                        | **Frame:** Home — no box       |
| `370:2954`                        | Category chips                 |
| `370:2995`                        | My Boxes welcome card          |
| `370:3027`                        | Holiday row                    |
| `370:3192`                        | Set the Stage                  |
| `370:3396` / `370:3400`           | Passover card / capacity ring  |
| `370:3426`                        | Hero card (full)               |
| `388:347`                         | Hero card (compact)            |
| `370:3514`                        | **Frame:** My Box              |
| `370:3524`                        | Sticky section nav             |
| `384:487` / `384:488` / `384:497` | Catalog rail / padding / stars |


Visual diff: `npm run compare:home` → `370:2949`.

---

## Recommended design order

1. ⬜ **Onboarding frames 6–9** + **Checkout 12** + **Order confirmation 13** — unblocks live flow polish
2. ⬜ **Home variants** (box started, delivery) on frame 1
3. ⬜ **My Box variants** (footer CTAs, guest banner) on frame 2
4. ⬜ **Rav thread 11**, **Catalog product 10**, **Welcome 5**
5. ⬜ **Account signed-in 14**, **Debrief 15**
6. ⬜ **Gift frames 16–17** — when Build 2 starts
7. Optional: **Desktop 18–19**, **App Store / print** separate tracks

---

## Updating this doc

When you finish a frame or component:

1. Add the **node ID** as a code comment (`/** Figma rGzXYb1rNVxqGHz81835Jn — NODE_ID — … */`).
2. Update status in the **Simplified frame plan** or **Components library** table.
3. Optional: export PNG to `assets/mockup-refs/` and wire `npm run compare:figma`.

---

## Appendix: frame detail reference

Expanded purpose / description for each numbered frame. Use when implementing or reviewing with engineering.

### Frame 1 — Home — no box ✅

**Preview:** [http://localhost:8081/?preview=home](http://localhost:8081/?preview=home)  
**Purpose:** Default landing — discover holidays, start a box, browse collections.  
**Description:** Sticky header (search + chips), pre-order hero, My Boxes welcome card, Build your Collection rails, Set the Stage, Passover card, tab bar. Same layout for guest and signed-in users without a started box.  
**Code:** `HomeScreen.tsx`

### Frame 2 — My Box — customize ✅

**Preview:** [http://localhost:8081/?preview=my-box](http://localhost:8081/?preview=my-box)  
**Purpose:** Full box customization by section (Candles, Dreidel, Food, Presents, Story).  
**Description:** Lock date subheader, sticky section nav, item rows with swap shelf, optional add-ons, order summary footer.  
**Code:** `MyBoxScreen.tsx`

### Frame 3 — Rav — welcome ✅

**Preview:** [http://localhost:8081/?preview=rav](http://localhost:8081/?preview=rav)  
**Purpose:** Starter prompts + search entry; re-tap Rav tab resets here.  
**Description:** Brand mark, Hanukkah countdown, search pill, 6–8 starter chips, Recent chats entry.  
**Code:** `RavScreen.tsx`, `PilotAIChatSheet.tsx`

### Frame 4 — Account — guest ✅

**Preview:** [http://localhost:8081/?preview=account](http://localhost:8081/?preview=account)  
**Purpose:** Convert signed-out users on Account tab.  
**Description:** Same as guest auth component — Google, email, sign up. Tab bar badge when guest.  
**Code:** `AccountScreen.tsx`, `GuestAuthPrompt.tsx`

### Frame 5 — Welcome / auth ⬜

**Preview:** [welcome](http://localhost:8081/?preview=welcome) · [sign-in](http://localhost:8081/?preview=sign-in) · [sign-in-email](http://localhost:8081/?preview=sign-in-email) · [sign-up](http://localhost:8081/?preview=sign-up)  
**Purpose:** First screen — explore without account, start onboarding, or log in.  
**Description:** “Grapejuice” + Hanukkah subtitle; Explore (filled), Build box (outline), Log in link; iOS Apple; footer hint about guest explore. Sign in / email / sign up can be component variants or separate artboards if you prefer.  
**Code:** `WelcomeScreen.tsx`, `SignInScreen.tsx`, `SignInEmailScreen.tsx`, `SignUpScreen.tsx`

### Frame 6 — Onboarding — intro ⬜

**Preview:** [onboarding-intro](http://localhost:8081/?preview=onboarding-intro) · [practices](http://localhost:8081/?preview=onboarding-practices) · [box-intro](http://localhost:8081/?preview=onboarding-box-intro)  
**Purpose:** Emotional framing + box value prop before personal questions.  
**Description:** Scroll combining kicker “Hanukkah 2026”, “Eight nights. Your pace.”, four practices overview, “Built for your family” box bullets. Single Continue at bottom.  
**Code:** `HanukkahIntroScreen.tsx`, `HanukkahPracticesScreen.tsx`, `BoxIntroScreen.tsx`

### Frame 7 — Onboarding — household ⬜

**Preview:** [household](http://localhost:8081/?preview=onboarding-household) · [familiarity](http://localhost:8081/?preview=onboarding-familiarity) · [rav](http://localhost:8081/?preview=onboarding-rav)  
**Purpose:** Capture curation inputs.  
**Description:** “Who’s celebrating?” child stepper + age chips; familiarity slider minimal↔all-in; “Anything Rav should know?” optional text + Skip.  
**Code:** `ChildrenScreen.tsx`, `FamiliaritySliderScreen.tsx`, `RavOpenQuestionScreen.tsx`

### Frame 8 — Onboarding — building ⬜

**Preview:** [http://localhost:8081/?preview=onboarding-building](http://localhost:8081/?preview=onboarding-building)  
**Purpose:** Loading interstitial (~3s).  
**Description:** Spinner, “Building your box”, rotating status lines. No actions.  
**Code:** `BuildingBoxScreen.tsx`

### Frame 9 — Box reveal 🟡

**Preview:** [http://localhost:8081/?preview=onboarding-reveal](http://localhost:8081/?preview=onboarding-reveal)  
**Purpose:** Hero reveal of curated default box.  
**Description:** Phase A: “Curated for you” recap with family summary + “Reveal my box”. Phase B: animated item list + hint about swaps on Home. CTA to Home; payment disclaimer per Q9.  
**Code:** `BoxRevealScreen.tsx`

### Frame 10 — Catalog product ⬜

**Preview:** [http://localhost:8081/?preview=catalog&itemId=graphic-novel-hanukkah](http://localhost:8081/?preview=catalog&itemId=graphic-novel-hanukkah) (swap `itemId` for any catalog id)  
**Purpose:** Product page from Home rail tap; add-to-box only.  
**Description:** Back, hero image, name, description, price tier, Add/Remove CTA; payment gate on paid extras.  
**Code:** `CatalogProductScreen.tsx`

### Frame 11 — Rav — chat thread 🟡

**Preview:** [http://localhost:8081/?preview=rav-chat](http://localhost:8081/?preview=rav-chat) (optional `&message=…`)  
**Purpose:** Ongoing AI conversation with product recommendations.  
**Description:** Message bubbles, composer, inline curation cards with see-more grid, thread footer with brand mark, Recent chats modal overlay.  
**Code:** `PilotAIChatSheet.tsx`, `RavBlockRenderer.tsx`

### Frame 12 — Checkout ⬜

**Preview:** [http://localhost:8081/?preview=checkout](http://localhost:8081/?preview=checkout) (auth gate until signed in)  
**Purpose:** Save card + shipping address; commit box without charging.  
**Description:** Charge-at-ship banner, order summary, address form, Stripe save-card area, primary CTA. Auth gate overlay for guests.  
**Code:** `CheckoutScreen.tsx`, `CheckoutScreen.web.tsx`

### Frame 13 — Order confirmation ⬜

**Preview:** `http://localhost:8081/?preview=order&orderId=YOUR_ORDER_ID` (after test checkout)  
**Purpose:** Reassurance after commit.  
**Description:** Checkmark, committed headline, charge-at-ship subtitle, “When it arrives” tips card, View Account / Back Home. Pending spinner variant.  
**Code:** `OrderConfirmationScreen.tsx`

### Frame 14 — Account — signed in 🟡

**Preview:** Sign in from [account](http://localhost:8081/?preview=account)  
**Purpose:** Orders, partner invite, sign out.  
**Description:** Email/name, order rows with status (“Committed — charged at ship”), invite by email + accept code, sign out.  
**Code:** `AccountScreen.tsx`

### Frame 15 — Hanukkah debrief ⬜

**Preview:** [http://localhost:8081/?preview=debrief](http://localhost:8081/?preview=debrief)  
**Purpose:** Post-holiday feedback + $80 Passover credit incentive.  
**Description:** Four step variants: Night 1–8 toggles → wins/misses text areas → one word → Yes/Maybe/No + thank you. Continue / Done / Skip.  
**Code:** `ReflectionFlowScreen.tsx`

### Frames 16–17 — Grandparent gift ⬜

**Purpose:** Giver purchases $50 box with ship address; recipient claims link without card if prepaid.  
**Description:** Giver: recipient fields + message + address + pay. Recipient: gift message, address confirm, box reveal entry.  
**Code:** Not built yet (Build 2)

### Frames 18–19 — Desktop ⬜ (optional)

**Preview:** [home](http://localhost:8081/?preview=home) or [my-box](http://localhost:8081/?preview=my-box) at viewport ≥1024px  
**Purpose:** Wide web layout with sidebar nav.  
**Description:** Reuse mobile components in multi-column layouts.  
**Code:** `WebDesktopFrame.tsx`, `useWebLayout.ts`