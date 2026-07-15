# Stripe setup — Grapejuice pilot

Grapejuice uses **one Stripe account** for both the Expo client and Firebase Cloud Functions. Publishable and secret keys must come from the **same** Stripe account (matching `pk_*` / `sk_*` account prefix).

**Scope:** `grapejuice/pilot-app` only. The legacy commerce app (`grapejuice/app/`) has its own Stripe config if still in use.

---

## Where keys live

| Location | Variables | Used by |
|----------|-----------|---------|
| `pilot-app/.env` | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Web + native checkout UI (`app.config.js` → `extra.stripePublishableKey`) |
| `pilot-app/functions/.env.grapejuice-pilot` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cloud Functions on deploy (Firebase CLI loads `functions/.env.<projectId>`) |
| `pilot-app/functions/.env` | Same as above | Keep in sync with `.env.grapejuice-pilot` if you use this file locally |

Do **not** commit `.env` files. Update Brendan's local copy after rotating keys.

---

## Switch to a new Stripe account

### 1. Stripe Dashboard (correct account)

In [Stripe Dashboard](https://dashboard.stripe.com) → **Developers → API keys**:

- Copy **Publishable key** (`pk_test_...` or `pk_live_...`)
- Copy **Secret key** (`sk_test_...` or `sk_live_...`)

Use **test mode** until pilot launch; switch both client and functions to live together.

### 2. Create webhook (new account)

**Developers → Webhooks → Add endpoint**

| Field | Value |
|-------|--------|
| **URL** | `https://stripewebhook-<hash>-uc.a.run.app` — get the exact URL from Firebase Console → Functions → `stripeWebhook`, or after deploy: `firebase functions:list --project grapejuice-pilot` |
| **Events** | `setup_intent.succeeded`, `payment_intent.succeeded` |

Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

> Legacy format may also appear as `https://us-central1-grapejuice-pilot.cloudfunctions.net/stripeWebhook` depending on deploy generation. Always use the URL shown in Firebase Console for the active function.

### 3. Update local env files

```bash
# pilot-app/.env
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# pilot-app/functions/.env.grapejuice-pilot  (and functions/.env if you use it)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart `npm run web` after changing the client key.

### 4. Redeploy

```bash
cd pilot-app
npm run firebase:deploy:functions   # picks up functions/.env.grapejuice-pilot
npm run deploy:hosting                # rebuilds web bundle with new publishable key
```

### 5. Disable old account webhook

In the **old** Stripe account, delete or disable the webhook pointing at `stripeWebhook` so events are not sent with the wrong signing secret.

### 6. Verify

1. **Checkout (web):** sign in → My Box → checkout → save test card `4242 4242 4242 4242`
2. **Webhook:** Stripe Dashboard → Webhooks → endpoint → recent deliveries should show `200`
3. **Firestore:** `households/{id}` should get `cardOnFileAt`, `stripeCustomerId`, `stripeDefaultPaymentMethodId`
4. **Gift flow:** giver checkout → `payment_intent.succeeded` finalizes gift invite

---

## Firestore data after account switch

Households created under the **old** Stripe account store `stripeCustomerId` and `stripeDefaultPaymentMethodId` that **do not exist** in the new account.

For pilot/test data: ignore or delete test households.

For real users (post-switch): they must **add payment again** at checkout. Optional cleanup on a household doc:

- Remove `stripeCustomerId`, `stripeDefaultPaymentMethodId`, `cardOnFileAt`
- Or delete test `households/` and `users/` entirely in dev

Orders with `stripePaymentIntentId` from the old account cannot be charged from the new account.

---

## What the webhook handles

| Event | Effect |
|-------|--------|
| `setup_intent.succeeded` | Sets card on file on household; default payment method on Stripe customer |
| `payment_intent.succeeded` | Confirms order or finalizes gift invite (`metadata.type === 'pilot_gift'`) |

Implementation: `functions/src/index.ts` → `stripeWebhook`.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| "Not configured" on checkout | Missing `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env` or hosting not redeployed |
| "Stripe is not configured" from Functions | Missing `STRIPE_SECRET_KEY` on deployed functions — redeploy after updating `.env.grapejuice-pilot` |
| Webhook verify failed / 400 | Wrong `STRIPE_WEBHOOK_SECRET` or webhook still on old Stripe account |
| Card saves in Stripe but not in app | Webhook URL wrong, event types missing, or household metadata missing on SetupIntent |
| Payment Element fails immediately | Publishable and secret keys from **different** Stripe accounts |

---

## Related files

- `functions/src/stripe.ts` — SDK init + webhook verification
- `src/screens/main/CheckoutScreen.web.tsx` — Stripe.js Payment Element
- `src/screens/gift/GiftGiveScreen.web.tsx`, `GiftGiverCustomizeScreen.web.tsx` — gift payments
- `docs/PILOT_DECISIONS.md` — charge-at-ship, gift pricing (Q1, Q7, Q8)
