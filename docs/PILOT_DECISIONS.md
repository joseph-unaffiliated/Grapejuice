# Grapejuice Pilot — Decision Questionnaire

**Status:** Locked from voice note (June 2026). Answers below unblock Builds 1–7, 9–10.

---

## Locked summary

| # | Topic | Decision |
|---|--------|----------|
| Q1 | Grandparent price | **$50** — same as pilot/discount price; charge covers full gift box |
| Q2 | Expedited fee | **Deferred** — long term distance-based at cost; short term flat fee, **no markup** |
| Q3 | Expedited lock offset | **~7 days** later than standard (7–10 OK); standard ~10–14 day ship window, expedited ~4 days; exact dates when lock set |
| Q4 | $80 credit storage | **Firestore balance** → applied at **Stripe checkout**; full checkout in Stripe long term |
| Q5 | Amazon fallback outreach | **2** attempts over 2 weeks → **3rd** touch is $20 Amazon offer (**in subject line**) |
| Q6 | Swap gate | **Browse** swap options OK; **block mutation** until card on file (prompt on item select) |
| Q7 | Card vs confirm | **One step** — card on file = box commitment; **no separate confirm**; **charge at ship** only |
| Q8 | Gift recipient card | **No card** if gift credit covers box; card only for expedited / paid extras |
| Q9 | Revealed copy | Self-serve: “Refine your box” + won’t ship until payment + address; Gift: confirm shipping address |
| Q10 | Gift expedited payer | **Parent (recipient)** |
| Q11 | Gift fields | Email, name, message, child ages, **grandparent enters ship address** |
| Q12 | Link expiry | **Never** |
| Q13 | My Box tab | **No 4th tab** — Home is the box hub (3 tabs: Home, Rav, Account) |
| Q14 | Ala carte store | **Hide store link**; items on Home + box browse; add-to-box only |
| Q15 | Home chips | **Category anchors** (Hanukkah, Dreidels, Apparel…) scroll to section |
| Q16 | Guest home | **Same layout**; Account tab badge if not signed in |
| Q17 | Debrief name | **Hanukkah debrief** |
| Q18 | Account edits | Display name, notifications, familiarity, kids/ages (onboarding fields) |
| Q19 | `content/nights` | Keep seed; **no app UI**; **not Rav context** until print material exists |
| Q20 | Fulfillment | **ShipStation** |
| Q21 | SMS | **Customer.io SMS** (connected) |
| Q22 | Push | **Yes if App Store ships**; email + SMS sufficient for web-only |
| Q23 | App Store | **Sign in with Apple** required; **12+** rating if it helps acceptance |
| Q24 | Legal URLs | **contact@grapejuice.co** · terms: `unaffiliated.co/terms/network` · privacy: `unaffiliated.co/privacy/network` (adapt) |

---

## Commerce and pricing

### Q1. Grandparent gift price

When a grandparent purchases a gift box, should they pay the **pilot promotional price ($50)** or the **standard list price ($80)**?

**Considerations:**
- $50 lowers friction for gift-givers and matches the parent self-serve pilot offer.
- $80 sets a higher anchor if grandparents are less price-sensitive.
- Accounting/reporting is simpler if gift and direct purchases use the same pilot price.

**Recommendation:** **$50** for the pilot (same as parent checkout).

**Your answer:** **$50** — same as the pilot/discount price. The $50 charge on the gift-giver’s card must fully cover the pilot box.

---

### Q2. Expedited shipping fee

How much should **expedited shipping** cost (on top of the free standard option)?

**Considerations:**
- Fee should cover incremental carrier cost + ops complexity, not feel like a second product.
- Too low → everyone picks expedited and ops strain; too high → no uptake.
- Typical consumer expectation for “rush” on a ~$50 box: **$8–$15**.

**Recommendation:** **$12** flat expedited fee for pilot (adjust after first carrier quotes).

**Your answer:** **Deferred for now.** Long term: fee should reflect actual carrier cost (distance-based). Short term: a flat fee at cost is fine — **no markup**.

---

### Q3. Expedited lock date offset

How much **extra customization time** does expedited shipping buy vs standard (i.e. how much later is the expedited lock date)?

**Considerations:**
- Standard lock must still allow warehouse lead time before Hanukkah (Dec 14, 2026 start).
- Expedited should feel meaningfully different — at least **7–10 days** later than standard.
- Warehouse must support two cutoffs without confusion.

**Recommendation:** **10 calendar days** later lock date for expedited (exact dates in `config/hanukkah-2026` once standard lock is set).

**Your answer:** Plan for **~10 days** (maybe 2 weeks) shipping window for **standard** lock; **~4 days** for expedited ship time. Expedited lock date **~7 days later** than standard (7–10 acceptable; lean **7**). Set exact dates when the standard lock date is confirmed.

---

### Q4. How to store the $80 feedback credit

When a family completes the post-Hanukkah debrief, how should the **$80 platform credit** (Passover next year) be represented?

**Considerations:**
- **Stripe Customer Balance** — native money ledger, works if Passover checkout uses same Stripe customer.
- **Firestore credit field** on user/household — flexible copy, requires custom checkout deduction logic.
- **Single-use coupon code** — simple ops, harder to prevent sharing/abuse.
- Passover product may not exist yet; credit might sit unused for months.

**Recommendation:** **Firestore `household.creditBalanceCents`** + checkout applies credit before Stripe charge; migrate to Stripe balance later if needed.

**Your answer:** Prefer **checkout entirely in Stripe** long term (liability/storage). OK to store credit in **Firestore** now and **apply it at Stripe checkout** when they purchase Passover. Gift recipients may not have a Stripe customer yet — Firestore ledger + Stripe checkout deduction is the preferred path. Avoid storing cards in-platform.

---

### Q5. Non-responder outreach before $20 Amazon gift card

How many **reminder outreaches** before offering the **$20 Amazon gift card** fallback?

**Considerations:**
- Too few → expensive; too many → families feel nagged.
- Channels: email first, then SMS if opted in.
- Need ops process to fulfill Amazon cards (manual is fine for ~200 families).

**Recommendation:** **3** outreach attempts over **2 weeks** post-holiday, then offer $20 Amazon card on the 4th touch.

**Your answer:** **2** outreach attempts over **2 weeks** post-holiday. The **3rd** touch **is** the $20 Amazon offer — put it **in the subject line** so it’s obvious.

---

## Card-on-file and box states

### Q6. Block swaps until card on file

Should **all box customization (swaps, adds, Rav mutations)** be blocked until a payment method is saved — even after the box reveal?

**Considerations:**
- Reduces “tire kickers” who customize without intent to buy.
- Reveal-first still delivers the “wow” moment; card unlocks the workshop.
- Gift recipients may already be fully paid — see Q8.

**Recommendation:** **Yes** — block swaps until card on file (or gift credit applied).

**Your answer:** **Partial gate.** Users can open swap UI and **see options**, but **cannot complete a swap** until card on file — selecting an item prompts payment. Don’t store convoluted boxes for people who never commit.

---

### Q7. Separate “save card” from “confirm order”

Should adding a card and **confirming the order** be two distinct steps, or one combined checkout moment?

**Considerations:**
- **Two steps:** clearer mental model (unlock customization → later commit to ship); more taps.
- **One step:** faster; blurs “card on file” vs “I’m buying.”
- Aligns with Q6: card early unlocks swaps; confirm happens at lock/checkout.

**Recommendation:** **Two steps** — (1) save card to unlock customization, (2) confirm order + address + shipping tier before lock.

**Your answer:** **One step — no separate confirm.** Putting card on file **is** committing to the Hanukkah box. They customize during the window; if untouched, it ships as-is. **Not charged until ship.** Card stays on file for future boxes. Provide a way to say “I don’t want this” before ship. No separate “confirm order” step.

---

### Q8. Gift recipient payment UI

When a parent opens a **grandparent gift link**, should they skip payment entirely, still add a card, or only add a card if they want to make swaps?

**Considerations:**
- Box is pre-paid → no box charge at confirm.
- Q6 may still want a card for incidentals (expedited shipping, future holidays).
- Some gift recipients may find card entry off-putting if “already paid.”

**Recommendation:** **Skip box payment**; **optional card** only if they choose expedited shipping or add paid extras later. **Swaps allowed without card** for fully pre-paid gift boxes (exception to Q6).

**Your answer:** **No card required** if gift credit covers the box. Swaps and customization allowed without card. Card only if they choose **expedited shipping** or add **paid extras** (prompt at add-to-box if needed).

---

### Q9. Copy for “revealed but not confirmed” box

What should families see on Home / My Box when the box is **revealed** but **not yet confirmed** to ship?

**Considerations:**
- Should feel exciting, not anxious (“draft” sounds unfinished).
- Clear CTA: add card (self-serve) or confirm address (gift).
- Countdown to lock date still visible.

**Recommendation:** Status line: **“Your box is ready — add a card to customize”** (self-serve) or **“Your gift box is ready — confirm shipping to customize”** (gift).

**Your answer:**
- **Gift path:** Once revealed, box **is committed to ship** (editable until lock). Grandparent enters shipping address; recipient sees **“Confirm your shipping address”** — address was entered by the gift-giver. Not “confirm shipping to customize” — customize freely; confirm **address** before it sends.
- **Self-serve, no card yet:** Same primary copy as card-on-file users (**“Refine your box”**). Subtext: **“Your box will not ship until you add payment information and a shipping address.”** Show this on the payment/card step too.

---

## Grandparent gift flow

### Q10. Who pays expedited shipping on a gift?

If the recipient chooses **expedited shipping**, who is charged?

**Considerations:**
- Grandparent paid fixed gift price → expedited may surprise parent at confirm.
- Grandparent could prepay expedited upgrade (complex UX).
- Parent paying expedited fee on a “gift” is common (shipping upgrade).

**Recommendation:** **Parent (recipient)** pays expedited fee at confirm — grandparent gift covers standard box + standard shipping only.

**Your answer:** **Parent (recipient)** — aligns with Q8 (card when choosing expedited).

---

### Q11. Gift message fields

What should the grandparent be able to include?

**Considerations:**
- Minimum: recipient email (required), recipient name.
- Nice: short gift message shown to parent on first open.
- Child names/ages for better default box — same as parent onboarding.

**Recommendation:** **Recipient name + email** (required), **optional 200-char message**, **child ages** (same as parent flow).

**Your answer:** **Required:** recipient email, recipient name, child names/ages, **shipping address**. **Optional:** gift message (~200 chars OK, can be longer). Grandparent provides the ship-to address.

---

### Q12. Gift invite link expiry

Should the magic link in the recipient email **expire**?

**Considerations:**
- No expiry → stale links if email forwarded months later.
- Too short → support burden if parent opens late.
- Hanukkah pilot timeline: links sent Oct–Nov should work through lock date.

**Recommendation:** Expire **60 days after send** or at **standard lock date**, whichever is sooner.

**Your answer:** **Never expire** — even if they find the email after the box arrives at their door.

---

## Navigation and home

### Q13. My Box tab vs Home-only entry

For **parents**, should My Box be a **bottom tab** or only reachable from **Home cards**?

**Considerations:**
- Spec originally had My Box as primary tab; current app has Home / Rav / Account.
- Tab increases discoverability; Home-only keeps tab bar minimal (3 tabs).
- My Box is the core action during customization season.

**Recommendation:** **Add My Box as a tab** for parent mode (4 tabs: Home, My Box, Rav, Account) — customization is the hero action.

**Your answer:** **Keep 3 tabs** (Home, Rav, Account). **Home is the My Box hub** — shows all boxes + broader e-commerce. Do not add a fourth tab.

---

### Q14. Ala carte / “Set the Stage” collection store

The home catalog rails link to an **Ala Carte store** screen. For pilot, should we:

**A)** Keep full store  
**B)** Hide the link (rails are browse-only / inspiration)  
**C)** Collection-only (view items, no separate store checkout)

**Considerations:**
- Pilot is “one curated box,” not a marketplace.
- Rails drive discovery and Rav context; separate store adds scope and support burden.
- Passover teaser on Home may be enough “future commerce” signal.

**Recommendation:** **B — Hide store link** for pilot; rails scroll horizontally on Home only. Revisit for Passover.

**Your answer:** **Hide the store link.** All à-la-carte items visible on **Home** and from **box browse** (e.g. “Browse Hanukkias”). Each item needs a **product page**. **No separate checkout** — add to box. If no card on file (e.g. gift), prompt for card when adding a paid item; charge at ship; adjustable until ship.

---

### Q15. Home search chips — which and what they do

Which chips appear under the search bar for Hanukkah pilot, and what happens on tap?

**Considerations:**
- Current placeholders (Holidays, Shabbat, Home, Stories, Recipes, Orders, Lists) exceed pilot scope.
- Chips should map to real behavior: scroll, Rav prompt, or tab.

**Recommendation:** **4 chips:**
- **Holidays** → scroll to My Boxes section  
- **Shabbat** → open Rav with preset prompt  
- **Orders** → Account tab  
- **Customize** → My Box (or scroll + CTA)

Remove Stories, Recipes, Lists, Home for pilot.

**Your answer:** **Product category chips** (Hanukkah, Dreidels, Apparel, etc.) — tap **scrolls to that section** on the Home page (collection categories).

---

### Q16. Guest vs signed-in home layout

Should **guests** (not signed in) see the **same home layout** as signed-in users, or a distinct marketing/guest variant?

**Considerations:**
- Same layout: less design/build; auth CTA can live in hero.
- Distinct guest home: clearer conversion funnel but duplicate Figma/maintenance.
- Many guests complete onboarding locally before auth at checkout.

**Recommendation:** **Same layout** with guest-specific hero copy + prominent “Build your box” / sign-in CTA; branch on order/box state only.

**Your answer:** **Same layout.** Signed-in users are further along (Rav chats, boxes in progress). Show a **notification/badge on Account tab** when not signed in.

---

## Content and profile

### Q17. Debrief product name and tone

Should the post-holiday survey be called **Debrief**, **Reflection**, or something else (e.g. “How was Hanukkah?”)?

**Considerations:**
- “Reflection” is softer; “Debrief” is clearer for incentives (“Complete debrief → $80 credit”).
- In-app route is currently `Reflection`.

**Recommendation:** User-facing: **“Hanukkah debrief”**; keep internal route name as-is.

**Your answer:** **Hanukkah debrief** (user-facing).

---

### Q18. Editable profile fields (Account)

Which fields can families edit from Account during pilot? (No kid management.)

**Considerations:**
- Minimum: display name, notification preferences.
- Onboarding captured familiarity + household — editing may change Rav/box context.
- Shipping address likely lives on order/checkout, not profile.

**Recommendation:** Editable: **display name**, **notification channels**, **familiarity level** (with “updates future suggestions” copy). Read-only: email. **No** household rename in pilot unless ops need it.

**Your answer:** Agree — **display name**, **notification channels**, **familiarity level**, **family structure** (kids, count, ages). Anything captured in onboarding.

---

### Q19. `content/nights` Firestore seed after removing in-app Guide

The Hanukkah Guide is **print-only**. What should we do with seeded `content/nights` in Firestore?

**Considerations:**
- App no longer reads it if Guide routes removed.
- May be useful for ops, Rav context, or future years.
- Dead data adds confusion.

**Recommendation:** **Keep seed for ops/Rav optional context** but **remove all app UI** that reads it. Document as non-user-facing.

**Your answer:** Remove all app UI. **Do not delete** Firestore seed. **Do not feed to Rav** for now — keep as reference until print material is designed in Figma; then provide print version to Rav.

---

## Ops and compliance

### Q20. Fulfillment platform

How should confirmed orders get to packing/shipping?

**Options:** ShipStation · EasyPost · Shippo · Manual CSV export · 3PL API

**Considerations:**
- ~200 boxes → manual CSV may suffice for pilot one.
- ShipStation is common for Shopify-adjacent ops; needs SKU mapping from `lineItems`.
- Tracking writeback to Firestore required for in-app delivery card.

**Recommendation:** **ShipStation** if ops already uses or can adopt it; else **weekly CSV export + manual tracking upload** for pilot with Firestore admin script as fallback.

**Your answer:** **ShipStation** — used before; proceed if API integration is viable.

---

### Q21. SMS provider for reminders

How should **text message** reminders be sent?

**Considerations:**
- Customer.io can do SMS if enabled on your plan.
- Twilio is flexible; another integration surface.
- SMS requires explicit opt-in and phone number collection.

**Recommendation:** **Customer.io SMS** if available on your account; else **Twilio** via Cloud Function. Email-only for pilot v1 if SMS compliance slows launch.

**Your answer:** **Customer.io SMS** — already connected.

---

### Q22. Push notifications scope for pilot

Should **in-app push** reminders be in scope for Hanukkah pilot?

**Considerations:**
- Push requires native app + FCM/APNs + permission prompts — heavy if web-only users dominate.
- Email + SMS may cover pilot cohort.
- App Store build (Build 10) needed for iOS push.

**Recommendation:** **Defer push to post-pilot** unless App Store ships early; implement **email + SMS** preference toggles first.

**Your answer:** **Push if App Store ships** — want to try App Store; then include push. Web-only pilot: **email + SMS** is sufficient.

---

### Q23. App Store — age rating and Sign in with Apple

For iOS submission:

**A)** Target age rating (likely **4+** or **12+** for account features)  
**B)** Is **Sign in with Apple** required? (Required if you offer Google/social sign-in on iOS)

**Considerations:**
- Apple rejects apps with third-party login but no SIWA.
- Kids tabled → no child-directed COPPA complexity for pilot.

**Recommendation:** Rating **4+**; **implement Sign in with Apple** before App Store submit (Google sign-in already exists).

**Your answer:** **Sign in with Apple — required.** Age rating **12+** is fine if it improves acceptance odds (4+ also acceptable — pick what helps approval).

---

### Q24. Privacy policy and support URL

What URLs should store listings and the app use for **privacy policy**, **terms**, and **support contact**?

**Considerations:**
- Required for App Store / Play / Stripe.
- Can be Untraditional legal pages initially with Grapejuice branding in app.

**Recommendation:** Use **untraditionall.com** or dedicated **grapejuice** landing legal pages; support **hello@** shared inbox — confirm exact URLs before store submit.

**Your answer:**
- **Support:** contact@grapejuice.co (domain: **grapejuice.co**)
- **Terms (template):** https://unaffiliated.co/terms/network
- **Privacy (template):** https://unaffiliated.co/privacy/network  
  Adapt from Untraditional newsletter-network copy for Grapejuice before store submit.

---

## Already decided (confirmed)

| Topic | Decision |
|-------|----------|
| Standard / discount box price | **$80** list · **$50** discount/pilot (same for gift-givers) |
| Kids accounts | Tabled — hidden for pilot |
| Hanukkah Guide in app | No — **print in box** |
| Passover card hold | Tabled — notify only |
| Standard shipping | **Free** |
| Feedback complete reward | **$80** platform credit |
| Non-responder fallback | **$20** Amazon (after outreach — see Q5) |
| Reveal before payment | **Yes** |
| Reminder channels | Email / SMS / push (user picks any combination) |

**Overrides:** None — all confirmed as stated.

---

*Decisions locked June 2026 from voice note. Next: Figma for card-gate + gift flows, then Builds 1 → 3 → 2 → 5.*
