# E2E Test Matrix — Parent Journey (Pilot)

Scripted manual test cases for the parent-facing Hanukkah pilot. Run on web (`npm run web`) and native (Expo Go) unless noted.

**Pricing baseline:** $50 promo box, $80 list, free US shipping, tax at checkout.

---

## 1. Welcome & guest entry

| ID | Steps | Expected |
|----|-------|----------|
| W1 | Open app unauthenticated | Welcome screen: Explore, Build box, Log in |
| W2 | Tap **Explore Grapejuice** | Main app (Home) without account |
| W3 | Tap **Build your Hanukkah box** | Onboarding flow (children → familiarity → reveal) |
| W4 | Production build: inspect Welcome | **Dev: enter app** not visible |
| W5 | `__DEV__` build: tap **Dev: enter app** | Same as Explore — enters main app |

---

## 2. Rav chat (parent)

| ID | Steps | Expected |
|----|-------|----------|
| R1 | Guest: send 2+ Rav messages | Guest save chip appears; no Firestore thread |
| R2 | Signed-in: open Rav, tap starter chip | New message in thread; assistant reply |
| R3 | Signed-in: menu → **Recent chats** | Past threads listed; active thread highlighted |
| R4 | Signed-in: reset/new chat (Rav screen control) | Welcome state; **new** thread ID (not default reuse) |
| R5 | Rav returns curation block with 7+ items | First 6 shown; **see more** expands grid |
| R6 | Tap product in curation / Swap in | Toast: "Added …" or "Swapped in …"; My Box updates |
| R7 | After lock date (`config.lockAt` in past) | Rav blocks disabled; auto-actions skipped; locked message in reply |

---

## 3. My Box & customization

| ID | Steps | Expected |
|----|-------|----------|
| B1 | Guest completes build path | My Box shows curated items; customize banner for guests |
| B2 | Guest: swap item → sign up at checkout | Account created; same line items at checkout |
| B3 | Signed-in: swap, add extra | Draft persists; order summary reflects add-ons (+$5 each) |
| B4 | Before lock date | Lock banner shows customize-until date |
| B5 | After lock date | Swaps/add-ons disabled; checkout may be blocked |

---

## 4. Checkout auth gate

| ID | Steps | Expected |
|----|-------|----------|
| C1 | Guest with box → Checkout (web) | **Save your box to checkout** gate; Create account / Log in |
| C2 | Guest with box → Checkout (native) | Same gate as web |
| C3 | From gate: Create account → complete sign-up | Returns to Checkout with box intact (not onboarding) |
| C4 | From gate: Log in (existing user, empty draft) | Checkout loads; guest draft merged if applicable |

---

## 5. Checkout & payment

| ID | Steps | Expected |
|----|-------|----------|
| P1 | Signed-in checkout order summary | Hanukkah box line shows **$50.00** |
| P2 | Add optional extra | Subtotal includes +$5 add-on |
| P3 | Enter valid US address → Continue / Pay | Stripe payment sheet (native) or Payment Element (web) |
| P4 | Complete test payment | Order confirmation screen with order ID |
| P5 | Box locked | Pay disabled; lock banner; API rejects if forced |

---

## 6. Post-purchase & account

| ID | Steps | Expected |
|----|-------|----------|
| A1 | Account tab | Profile, household visible |
| A2 | Log out → Log in | Draft/order history preserved |
| A3 | Home delivery card (if ordered) | Tracking / delivery copy shown |

---

## 7. Regression smoke (5 min)

1. Welcome → Explore → Rav message → My Box visible  
2. Build box path → reveal → checkout gate → sign up → $50 summary  
3. Rav history → open old thread → highlight correct row  
4. `npm run build:web` completes without errors  

---

## Environment notes

- Firebase project: `grapejuice-pilot` (see Welcome Firebase status)
- Stripe: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` + deployed `createPilotCheckout`
- Lock date: Firestore `config/hanukkah-2026.lockAt`
- Box price override: `config/hanukkah-2026.boxPriceCents` (default 5000)
