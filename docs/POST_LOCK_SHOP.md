# Post-lock shop mode (Hanukkah 2026)

After box lock until the last night of Hanukkah, the storefront runs in **`shop`** mode.

## Behavior

- Cold shoppers: countdown hero, Browse CTA (no Build my box), Passover pre-register strip, FBA-in-stock rails, empty nav categories hidden
- Box holders: locked journey hero + Browse + View order/Track; Orders via nav / cart button
- Family link `/d/order/<token>`: unchanged pre-lock box build (never forced into shop). Clear this device with `/d/clear-family` (also `/d/remove-friends-and-family`), or Admin panel → Clear family-order unlock.
- Abandoned drafts: first shop visit merges line items into favorites (draft + history kept)
- Marketplace shipping: UPS Ground weight tiers + Airtable FBA fee → “Shipping & fulfillment”
- No “Arrives by Nov 21” / arrives-in-time-for-Hanukkah copy on PDP, cart, or checkout
- Passover chrome only after Hanukkah ends

## QA

Admin control panel → preview day **Shop (post-lock)** / **During Hanukkah shop** / **Passover**. User-state personas feed the **same** home-mode resolver as Live — they remap auth/box/payment/order inputs only. The lock calendar (or pinned preview day) still decides shop vs customize.

- **Live (you)** = exact real-account chrome (no persona short-circuits).
- **Signed in · locked** = post-lock box holder (Orders path; stand-in open order if the live household has none).
- Pre-lock personas (**Signed in · box**, **needs payment**, guest box, etc.) after the real lock look like those users post-lock (usually shop). Pin a **pre-lock** preview day to see customize / payment-gate chrome.

## Packs

See [AIRTABLE_CATALOG_SYNC.md](./AIRTABLE_CATALOG_SYNC.md) — new Airtable SKUs with Sell After Lock = Yes.
