# Charge at lock — Hanukkah box payment model

**Status:** Shipped in code (Sep 2026). **Deploy required** before production use.

Aligned with `PILOT_DECISIONS.md` Q7: card on file = commitment; **one charge after customization ends** (at `lockAt`), not at commit.

---

## How it works

| Step | What happens |
|------|----------------|
| **Checkout** | Customer saves card via Stripe **SetupIntent** (`createPilotSetupIntent`). No charge. |
| **Commit** | `commitPilotBox` creates order `status: committed`, applies gift/platform credit, saves address. **No PaymentIntent.** |
| **Customize** | Swaps/add-ons update `boxDrafts/hanukkah-2026` until lock. |
| **Charge** | `scheduledChargePilotBoxes` (hourly) or `chargePilotBoxOrder` callable charges **final draft total** with one off-session PaymentIntent. |
| **Confirm** | `payment_intent.succeeded` webhook → `confirmed` + order email + ShipStation export (if keys set). |

**Not in scope:** Marketplace and gift purchases still charge immediately at checkout.

**Trigger:** Engineering default = **lock date** (`config/hanukkah-2026.lockAt`), not physical ship. Joseph can revisit ship-trigger later.

---

## Code map

| Piece | Location |
|-------|----------|
| Commit (no charge) | `functions/src/index.ts` → `commitPilotBox` |
| Charge logic | `functions/src/chargePilotBox.ts` |
| QA callable | `chargePilotBoxOrder` |
| Scheduler | `scheduledChargePilotBoxes` (every 1 hour) |
| Webhook | `stripeWebhook` — `hanukkah_box`, `payment_intent.payment_failed` |
| Dev UI | Orders → **Dev: charge now** (`__DEV__` only) |
| Client helper | `src/services/checkout/chargePilotBoxOrder.ts` |

---

## Brendan — test checklist (after deploy)

### 1. Commit path (no charge)

1. `npm run web` (or deployed site) — sign in, build box, checkout.
2. Save test card (`4242…`) via SetupIntent.
3. Commit to box.
4. **Stripe Dashboard** → Customer → **no new PaymentIntent** for this commit.
5. Firestore order → `status: committed`, `orderType: hanukkah_box`, no `stripePaymentIntentId` (new orders).

### 2. Swap then charge

1. After commit, add a paid add-on on My Box.
2. Orders → **Dev: charge now** (dev build only) **or** wait until `lockAt` passes.
3. Stripe → one PaymentIntent for **post-swap** total.
4. Order → `status: confirmed`, updated `lineItems` / `totalCents`.

### 3. $0 / gift credit

1. Household gift credit covers full box at charge time.
2. Dev charge → `confirmed_zero`, no PI.

### 4. Failed charge

1. Use Stripe test card that fails off-session (e.g. `4000000000000341` on file).
2. Order stays `committed`; `chargeFailureMessage` on order doc; shown on Orders card.

### 5. Cancel before charge

1. Cancel committed box from Orders.
2. Credits restored; no charge.

### 6. Webhook (optional local)

```bash
stripe listen --forward-to https://<stripeWebhook-url>
```

Ensure events include `setup_intent.succeeded`, `payment_intent.succeeded`, `payment_intent.payment_failed`.

---

## Deploy checklist

See root `package.json` scripts. Minimum for this feature:

```bash
# 1. Functions env (local file, not committed)
# functions/.env.grapejuice-pilot
#   STRIPE_SECRET_KEY=sk_test_...
#   STRIPE_WEBHOOK_SECRET=whsec_...
#   SHIPSTATION_API_KEY=...      # optional until SS ready
#   SHIPSTATION_API_SECRET=...

cd functions && npm run build && cd ..

# 2. Firestore index (orders collection group)
npm run firebase:deploy:rules   # includes indexes if firestore.indexes.json changed

# 3. Functions (charge + webhook + scheduler)
npm run firebase:deploy:functions

# 4. Web app (Dev charge button, Orders copy)
npm run deploy:hosting
```

**Stripe Dashboard:** Add `payment_intent.payment_failed` to webhook endpoint if missing.

**ShipStation:** Export runs after charge; no-op without keys in `functions/.env.grapejuice-pilot`.

---

## Still open (Phase 3)

- Production Stripe live keys (with Joseph)
- ShipStation API keys + v1 webhook for tracking writeback
- Customer.io email when charge fails
- My Box payment-pending copy (Q9) — separate card
- Optional: charge at **ship** instead of lock (product decision)
