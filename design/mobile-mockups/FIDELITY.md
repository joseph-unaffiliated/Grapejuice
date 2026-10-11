# Phone vs. mockup backlog

Run by `/mockup-autopilot`. Capture with `node scripts/mockup-fidelity/run.mjs`; composites land in `tmp/fidelity/latest/`.

## Open

### Shared

### Home

### Product page

### Category / collection
- [ ] Collection ("Shop everything"): sections per category with "See all", instead of one 87-item grid.

### My Box
- [ ] Wrapping: Paper / We wrap / No wrap segmented control with the "Enough paper for" checklist, instead of a Wrapping Paper row.
- [ ] Suggestion row: "Low stock" outline tag under the name when it applies.

### Checkout
- [ ] Field labels: muted 12.5px, no bold or red asterisks; inputs 50px, gold border, 12px radius.
- [ ] "Have a discount code?" sits in Payment, not under the summary.
- [ ] "+ Apt, suite or floor" link instead of an always-visible Address line 2.

### Onboarding
- [ ] Family: short two-line intro, a five-icon row, "Who's celebrating?", member cards, the age pill row, interests pills, and the "Sam gets…" preview above the button. App still shows the long manifesto and the old form.
- [ ] Primary button black/gold, not grey.

### Gift
- [ ] Landing: photo 250px, "Send by Nov 7" pill, H1 at 29px, cream "How gifting works" band. App photo fills the first screen.
- [ ] Type step: "What would you like to send?" with two radio cards (box with thumbnails / credit), white bottom bar with total and black Continue. No storefront footer.
- [ ] Remaining steps: family, save your gift, note, how they get it, pay, sent.

### Content
- [ ] Light the candles: no hero photo; eyebrow, H1, lede, then the hanukkiah card.
- [ ] Play dreidel: compare.

### Sign-in
- [ ] "Sign in", one-line lede, muted label, gold-bordered input, Apple/Google buttons, "New here? Build a box" and "Use a password instead" links.

## Done
- [x] Sticky bottom bars scroll with the page instead of staying pinned (product, home, My Box): `position: fixed` sits inside the transformed page scroller. Portal the bar to the document body.
- [x] Browsing pages show the promo strip and the black category rail under the header. Mockup: the white site header only.
- [x] Primary/secondary buttons: mockup text is 17px regular (400); app is 16px medium.
- [x] Product tile: inventory shows as "Low stock · 6 left" in place of the price. Mockup: a small white "Low stock" tag on the photo's top-left, price always under the name, no counts.
- [x] Product tile button: mockup 38px tall, 13.5px text; app is taller with larger text. Name 14px/1.3, no reserved second line.
- [x] Category/filter chips: mockup 34px tall, 13px text; app 36px / 15px.
- [x] Section titles on bands are 22px/500 (`.band .h2`), section rows 20px.
- [x] Mosaic: edge to edge, square corners, 4px gaps, 300px tall, columns 1.25fr / 1fr.
- [x] Hero copy block: padding 22/16/26, 12px gaps, H1 32px.
- [x] "Eight nights, one box" is a white band; rows are 112px photos with 14px radius and no dividers, titles "Light the Candles / Play Dreidel / Eat & Drink / Tell the Story / Gifts for each kid"; ends with "Build my box · from $80".
- [x] "How it works" is the cream band, with mockup copy.
- [x] Category tiles are 1.15:1, not square.
- [x] Gift module: full-width doorstep photo (170px) over a cream panel, "Send a box to another family", sub, black "Send a gift" button.
- [x] Missing "Our story" module (eyebrow, quote, lede, "Read our story").
- [x] Missing "Questions? Ask Rav" row.
- [x] Returning visitor: no "Eight nights" or "How it works" sections; box card goes straight to "Shop by category".
- [x] No "‹ Menorahs" breadcrumb row on browse (only when opened from the box).
- [x] Hero photo is 334px tall, not square.
- [x] "Low stock" tag beside the price.
- [x] Details as list rows (title + muted sub), not a two-column spec table.
- [x] No black site footer under product pages.
- [x] Header spacing: title 29px, sub 14px, tighter to chips.
- [x] In-your-box tile state (gold outline + check + "In your box · included").
- [x] Section headers: no description paragraphs; 20px regular title with the site icon.
- [x] Lock line: "Change anything until Nov 7 · 28 days left · Add to calendar", muted with a gold link.
- [x] "Swap or add" is a centered button with minis left of the label.
- [x] Home and editorial pages use the mockup's ink footer (mark, tagline, Shop / Company / Contact); browsing pages have none.
- [x] My Box: each kid's present shows under "Gifts for Sam" (it was hidden when the gift was a present-type item).
- [x] My Box: inline "+ $X" suggestion per section; might-like shelf uses "+ Add" pills; Checkout button hugs its label.
- [x] Donate control uses a hand-with-coin icon (Font Awesome) instead of the gift/heart.

## Keep
- Real prices and product data instead of the mockup's sample prices.
- The site's icons instead of the mockup's placeholder icons.
- Headless capture can't play the mockup's mp4 reel, so the mockup's big mosaic cell is blank in composites.

## Blocked
- Cart: the app redirects an empty cart; needs a cart fixture before it can be compared.
- Account: needs a signed-in fixture.
