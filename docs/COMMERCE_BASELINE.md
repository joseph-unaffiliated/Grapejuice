# Grapejuice commerce baseline (preserved)

**Date:** June 2026  
**Location:** `grapejuice/app/`  
**Firebase project:** `untraditional-commerce` (`.firebaserc`)

This snapshot is the **marketplace / e-commerce** Grapejuice app: Browse, cart, product catalog, bundles, Rav AI chat, account admin product tools. It remains runnable and unchanged by the Hanukkah pilot except for this README pointer.

## What it includes

- Expo SDK 54, bundle ID `app.grapejuice`, slug `grapejuice`
- Firestore: `products`, `bundles`, cart, `users/.../aiChats`
- Cloud Functions: `createPaymentIntent`, `askAI`
- Design: light gold-on-white commerce UI + brand assets in `assets/visuals/`

## What it is not

- Hanukkah curated box flow, household invites, box lock date, reflection research, Passover card hold
- Those live in **`grapejuice/pilot-app/`** with a **separate Firebase project**

## Restore / compare

If you use git:

```bash
git tag grapejuice-commerce-baseline   # run once from repo root when ready
git checkout grapejuice-commerce-baseline -- grapejuice/app
```

Without git: this folder was left in place; pilot work happens only under `pilot-app/`.
