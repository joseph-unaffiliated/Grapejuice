# Phone vs. mockup backlog

Run by `/mockup-autopilot`. Capture with `node scripts/mockup-fidelity/run.mjs`; composites land in `tmp/fidelity/latest/`.

## Open

### Shared

### Home

### Product page

### Category / collection

### My Box
- [ ] Tradition sheet: short one-line sub under an icon title; "Candles · 1 included" subhead; alternatives as cards with Swap and "+$X" (add on top); "Add on top" should list other things (menorahs for the grown-ups), not the swap alternatives again.
- [ ] Product card: smaller centered photo, close button, section eyebrow, "Swap it in" / "Add one on top" option rows with price pills, "See full details" row.
- [ ] Receipt: phone section names (Eat & Drink, Giving Gifts) and rules between sections.
- [ ] Wrapping: Paper / We wrap / No wrap segmented control with the "Enough paper for" checklist, instead of a Wrapping Paper row.
- [ ] Suggestion row: "Low stock" outline tag under the name when it applies.

### Checkout
- [ ] Field labels: muted 12.5px, no bold or red asterisks; inputs 50px, gold border, 12px radius.
- [ ] "Have a discount code?" sits in Payment, not under the summary.
- [ ] "+ Apt, suite or floor" link instead of an always-visible Address line 2.

### Account
- [ ] Hub: "Hi, {name}" greeting; box card with a status pill, lock line and a black "View my box" button; "Your account" eyebrow; rows with icon tiles; Shipping address, Box helpers and Sign-in rows.
- [ ] Orders: phone task header, This year / Past years chips, rows with stacked thumbs and status lines. App shows the desktop page with nav pills.
- [ ] Gifts: Sent / Received chips, gift rows with a status pill, Resend / Add their address, lock note, "Send another gift". App shows the desktop page.
- [ ] Family: its own page (kid rows with Edit, "+ Add a kid · $10", How you celebrate rows, note). App opens the old form in a sheet.
- [ ] Payment: card on file with Replace. App goes straight to the Stripe form.

### Rav
- [ ] Task header (Back · Rav · New chat), left-aligned title and sub, four suggestion rows, and a pinned reply field with the "Rav can see your box" line. App shows the desktop chat with chip clouds.

### Store
- [ ] Role chooser: "Add to your box as…" with the item thumb, radio option cards with prices, then "Add to my box". App shows a plain list with Cancel.
- [ ] Favorites: phone header and sub, item count, two-column tiles with "Add to my box". App shows the desktop page with nav pills.

### Onboarding
- [ ] Family: short two-line intro, a five-icon row, "Who's celebrating?", member cards, the age pill row, interests pills, and the "Sam gets…" preview above the button. App still shows the long manifesto and the old form.
- [ ] Primary button black/gold, not grey.

### Gift
- [ ] Their family: "Who is it for?", Family name field, Kids stepper, a card per kid with age chips, "+ Add a kid · $10", bar "Gift box for 1 kid · $80 · Pick their box". App shows the desktop form and $0.00.
- [ ] Save your gift: name + email code entry. App shows "Enter your email to start curating".
- [ ] Credit: "How much credit?" with $50 / $80 / $120 tiles, other amount, family name, their email.
- [ ] Their box: the My Box editor with "A gift for {family}" pill. App shows the desktop curation list.
- [ ] Note (with preview card), How they get it (two radio options), Pay, Sent: still the desktop form.

### Content

### Sign-in

## Done
- [x] My Box: donated items stay in their section, faded with a grey photo, "Donating · goes to a family who wouldn't otherwise celebrate" and Undo.
- [x] Header account button goes straight to the Account page on phones (it opened a drawer).
- [x] Pinned bottom bars hide when their screen is covered (My Box's bar showed over Account).
- [x] My Box warms checkout: loads Stripe.js and creates the SetupIntent so the card form is ready on arrival.
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

- [x] Site header is 60px with no rule under it (10px padding, 40px row).
- [x] Footer: Contact column sizes to the email like the mockup's grid instead of truncating it.
- [x] Sign-in: "Sign in" header and H1, one-line lede, muted Email label, 50px gold-bordered input, "or" divider, 50px outlined Google button, new-here line.
- [x] Shared code entry (checkout gate, account): same field and code-box styling.
- [x] Menu: muted section heads, two-column Shop tiles with thumbnails and "Shop everything ›", gold Ask Rav icon, "Email us" row, Sign in row when signed out with no box.
- [x] Gift landing: 250px photo, "Send by" pill, one CTA, cream "How gifting works" with three steps, Questions as rows that open the full answer.
- [x] Gift type: "What would you like to send?", radio cards (box with sample thumbnails, credit), white stacked bar with Continue, no storefront footer, no step bar on this step.
- [x] Light the candles: no hero; mockup header type; Tonight steps; longer copy behind rows (blessings, placement, after lighting); "What you need" rows; dark "Everything for all eight nights" band.
- [x] Play dreidel: 220px hero, 2×2 letter cards, Good to know, rules and history behind rows, What you need, dark band with the lock date.
- [x] Collection: "Shop everything" with two picks per aisle and See all.

## Keep
- Apple sign-in isn't offered on web (no Apple web provider configured); "Use a password instead" is omitted because phones have no password screen.
- Gift type starts with nothing selected: preselecting would mark a gift as started for anyone who only looks.
- Real Hanukkah dates from config (first night Dec 5 in the data) instead of the mockup's Dec 4.
- Long how-to copy stays reachable behind list rows rather than being cut.
- Real prices and product data instead of the mockup's sample prices.
- The site's icons instead of the mockup's placeholder icons.
- Donations are remembered for the session only (same as desktop); a fully donated item drops off after a reload.
- Headless capture can't play the mockup's mp4 reel, so the mockup's big mosaic cell is blank in composites.

## Blocked
- Cart: the app redirects an empty cart; needs a cart fixture before it can be compared.
- Gift recipient (gift-recipient.html) and order detail need a real gift / order; content "Closed after the lock" can't be reached before the lock.
