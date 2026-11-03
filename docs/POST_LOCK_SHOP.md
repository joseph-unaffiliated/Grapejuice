# Post-lock shop mode (Hanukkah 2026)

After box lock until the last night of Hanukkah, the storefront runs in **`shop`** mode.

## Behavior

- Cold shoppers: countdown hero, Browse CTA (no Build my box), Passover pre-register strip, FBA-in-stock rails, empty nav categories hidden
- Box holders: locked journey hero + Browse + View order/Track; Orders via nav / cart button
- Family link `/d/order/<token>`: unchanged pre-lock box build (never forced into shop)
- Abandoned drafts: first shop visit merges line items into favorites (draft + history kept)
- Marketplace shipping: UPS Ground weight tiers + Airtable FBA fee → “Shipping & fulfillment”
- No “Arrives by Nov 21” / arrives-in-time-for-Hanukkah copy on PDP, cart, or checkout
- Passover chrome only after Hanukkah ends

## QA

Admin control panel → preview day **Shop (post-lock)** / **During Hanukkah shop** / **Passover**. User state **Signed in · locked** resolves to shop with box-holder chrome (Orders / My Hanukkah box nav).

User-state previews override the calendar for *persona* (e.g. **Signed in · box** stays customize chrome even on a post-lock pin). That’s intentional for isolated QA — use **Live (you)** + a shop date pin for the realistic combo.

## Packs

See [AIRTABLE_CATALOG_SYNC.md](./AIRTABLE_CATALOG_SYNC.md) — new Airtable SKUs with Sell After Lock = Yes.
