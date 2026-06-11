# Grapejuice Pilot — Decision Questionnaire

Answer these in a voice note (or inline). Each question includes context, considerations, and a **recommended default** if you want to move fast.

---

## Commerce and pricing

### Q1. Grandparent gift price

When a grandparent purchases a gift box, should they pay the **pilot promotional price ($50)** or the **standard list price ($80)**?

**Considerations:**
- $50 lowers friction for gift-givers and matches the parent self-serve pilot offer.
- $80 sets a higher anchor if grandparents are less price-sensitive.
- Accounting/reporting is simpler if gift and direct purchases use the same pilot price.

**Recommendation:** **$50** for the pilot (same as parent checkout).

**Your answer:**

---

### Q2. Expedited shipping fee

How much should **expedited shipping** cost (on top of the free standard option)?

**Considerations:**
- Fee should cover incremental carrier cost + ops complexity, not feel like a second product.
- Too low → everyone picks expedited and ops strain; too high → no uptake.
- Typical consumer expectation for “rush” on a ~$50 box: **$8–$15**.

**Recommendation:** **$12** flat expedited fee for pilot (adjust after first carrier quotes).

**Your answer:**

---

### Q3. Expedited lock date offset

How much **extra customization time** does expedited shipping buy vs standard (i.e. how much later is the expedited lock date)?

**Considerations:**
- Standard lock must still allow warehouse lead time before Hanukkah (Dec 14, 2026 start).
- Expedited should feel meaningfully different — at least **7–10 days** later than standard.
- Warehouse must support two cutoffs without confusion.

**Recommendation:** **10 calendar days** later lock date for expedited (exact dates in `config/hanukkah-2026` once standard lock is set).

**Your answer:**

---

### Q4. How to store the $80 feedback credit

When a family completes the post-Hanukkah debrief, how should the **$80 platform credit** (Passover next year) be represented?

**Considerations:**
- **Stripe Customer Balance** — native money ledger, works if Passover checkout uses same Stripe customer.
- **Firestore credit field** on user/household — flexible copy, requires custom checkout deduction logic.
- **Single-use coupon code** — simple ops, harder to prevent sharing/abuse.
- Passover product may not exist yet; credit might sit unused for months.

**Recommendation:** **Firestore `household.creditBalanceCents`** + checkout applies credit before Stripe charge; migrate to Stripe balance later if needed.

**Your answer:**

---

### Q5. Non-responder outreach before $20 Amazon gift card

How many **reminder outreaches** before offering the **$20 Amazon gift card** fallback?

**Considerations:**
- Too few → expensive; too many → families feel nagged.
- Channels: email first, then SMS if opted in.
- Need ops process to fulfill Amazon cards (manual is fine for ~200 families).

**Recommendation:** **3** outreach attempts over **2 weeks** post-holiday, then offer $20 Amazon card on the 4th touch.

**Your answer:**

---

## Card-on-file and box states

### Q6. Block swaps until card on file

Should **all box customization (swaps, adds, Rav mutations)** be blocked until a payment method is saved — even after the box reveal?

**Considerations:**
- Reduces “tire kickers” who customize without intent to buy.
- Reveal-first still delivers the “wow” moment; card unlocks the workshop.
- Gift recipients may already be fully paid — see Q8.

**Recommendation:** **Yes** — block swaps until card on file (or gift credit applied).

**Your answer:**

---

### Q7. Separate “save card” from “confirm order”

Should adding a card and **confirming the order** be two distinct steps, or one combined checkout moment?

**Considerations:**
- **Two steps:** clearer mental model (unlock customization → later commit to ship); more taps.
- **One step:** faster; blurs “card on file” vs “I’m buying.”
- Aligns with Q6: card early unlocks swaps; confirm happens at lock/checkout.

**Recommendation:** **Two steps** — (1) save card to unlock customization, (2) confirm order + address + shipping tier before lock.

**Your answer:**

---

### Q8. Gift recipient payment UI

When a parent opens a **grandparent gift link**, should they skip payment entirely, still add a card, or only add a card if they want to make swaps?

**Considerations:**
- Box is pre-paid → no box charge at confirm.
- Q6 may still want a card for incidentals (expedited shipping, future holidays).
- Some gift recipients may find card entry off-putting if “already paid.”

**Recommendation:** **Skip box payment**; **optional card** only if they choose expedited shipping or add paid extras later. **Swaps allowed without card** for fully pre-paid gift boxes (exception to Q6).

**Your answer:**

---

### Q9. Copy for “revealed but not confirmed” box

What should families see on Home / My Box when the box is **revealed** but **not yet confirmed** to ship?

**Considerations:**
- Should feel exciting, not anxious (“draft” sounds unfinished).
- Clear CTA: add card (self-serve) or confirm address (gift).
- Countdown to lock date still visible.

**Recommendation:** Status line: **“Your box is ready — add a card to customize”** (self-serve) or **“Your gift box is ready — confirm shipping to customize”** (gift).

**Your answer:**

---

## Grandparent gift flow

### Q10. Who pays expedited shipping on a gift?

If the recipient chooses **expedited shipping**, who is charged?

**Considerations:**
- Grandparent paid fixed gift price → expedited may surprise parent at confirm.
- Grandparent could prepay expedited upgrade (complex UX).
- Parent paying expedited fee on a “gift” is common (shipping upgrade).

**Recommendation:** **Parent (recipient)** pays expedited fee at confirm — grandparent gift covers standard box + standard shipping only.

**Your answer:**

---

### Q11. Gift message fields

What should the grandparent be able to include?

**Considerations:**
- Minimum: recipient email (required), recipient name.
- Nice: short gift message shown to parent on first open.
- Child names/ages for better default box — same as parent onboarding.

**Recommendation:** **Recipient name + email** (required), **optional 200-char message**, **child ages** (same as parent flow).

**Your answer:**

---

### Q12. Gift invite link expiry

Should the magic link in the recipient email **expire**?

**Considerations:**
- No expiry → stale links if email forwarded months later.
- Too short → support burden if parent opens late.
- Hanukkah pilot timeline: links sent Oct–Nov should work through lock date.

**Recommendation:** Expire **60 days after send** or at **standard lock date**, whichever is sooner.

**Your answer:**

---

## Navigation and home

### Q13. My Box tab vs Home-only entry

For **parents**, should My Box be a **bottom tab** or only reachable from **Home cards**?

**Considerations:**
- Spec originally had My Box as primary tab; current app has Home / Rav / Account.
- Tab increases discoverability; Home-only keeps tab bar minimal (3 tabs).
- My Box is the core action during customization season.

**Recommendation:** **Add My Box as a tab** for parent mode (4 tabs: Home, My Box, Rav, Account) — customization is the hero action.

**Your answer:**

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

**Your answer:**

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

**Your answer:**

---

### Q16. Guest vs signed-in home layout

Should **guests** (not signed in) see the **same home layout** as signed-in users, or a distinct marketing/guest variant?

**Considerations:**
- Same layout: less design/build; auth CTA can live in hero.
- Distinct guest home: clearer conversion funnel but duplicate Figma/maintenance.
- Many guests complete onboarding locally before auth at checkout.

**Recommendation:** **Same layout** with guest-specific hero copy + prominent “Build your box” / sign-in CTA; branch on order/box state only.

**Your answer:**

---

## Content and profile

### Q17. Debrief product name and tone

Should the post-holiday survey be called **Debrief**, **Reflection**, or something else (e.g. “How was Hanukkah?”)?

**Considerations:**
- “Reflection” is softer; “Debrief” is clearer for incentives (“Complete debrief → $80 credit”).
- In-app route is currently `Reflection`.

**Recommendation:** User-facing: **“Hanukkah debrief”**; keep internal route name as-is.

**Your answer:**

---

### Q18. Editable profile fields (Account)

Which fields can families edit from Account during pilot? (No kid management.)

**Considerations:**
- Minimum: display name, notification preferences.
- Onboarding captured familiarity + household — editing may change Rav/box context.
- Shipping address likely lives on order/checkout, not profile.

**Recommendation:** Editable: **display name**, **notification channels**, **familiarity level** (with “updates future suggestions” copy). Read-only: email. **No** household rename in pilot unless ops need it.

**Your answer:**

---

### Q19. `content/nights` Firestore seed after removing in-app Guide

The Hanukkah Guide is **print-only**. What should we do with seeded `content/nights` in Firestore?

**Considerations:**
- App no longer reads it if Guide routes removed.
- May be useful for ops, Rav context, or future years.
- Dead data adds confusion.

**Recommendation:** **Keep seed for ops/Rav optional context** but **remove all app UI** that reads it. Document as non-user-facing.

**Your answer:**

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

**Your answer:**

---

### Q21. SMS provider for reminders

How should **text message** reminders be sent?

**Considerations:**
- Customer.io can do SMS if enabled on your plan.
- Twilio is flexible; another integration surface.
- SMS requires explicit opt-in and phone number collection.

**Recommendation:** **Customer.io SMS** if available on your account; else **Twilio** via Cloud Function. Email-only for pilot v1 if SMS compliance slows launch.

**Your answer:**

---

### Q22. Push notifications scope for pilot

Should **in-app push** reminders be in scope for Hanukkah pilot?

**Considerations:**
- Push requires native app + FCM/APNs + permission prompts — heavy if web-only users dominate.
- Email + SMS may cover pilot cohort.
- App Store build (Build 10) needed for iOS push.

**Recommendation:** **Defer push to post-pilot** unless App Store ships early; implement **email + SMS** preference toggles first.

**Your answer:**

---

### Q23. App Store — age rating and Sign in with Apple

For iOS submission:

**A)** Target age rating (likely **4+** or **12+** for account features)  
**B)** Is **Sign in with Apple** required? (Required if you offer Google/social sign-in on iOS)

**Considerations:**
- Apple rejects apps with third-party login but no SIWA.
- Kids tabled → no child-directed COPPA complexity for pilot.

**Recommendation:** Rating **4+**; **implement Sign in with Apple** before App Store submit (Google sign-in already exists).

**Your answer:**

---

### Q24. Privacy policy and support URL

What URLs should store listings and the app use for **privacy policy**, **terms**, and **support contact**?

**Considerations:**
- Required for App Store / Play / Stripe.
- Can be Untraditional legal pages initially with Grapejuice branding in app.

**Recommendation:** Use **untraditionall.com** or dedicated **grapejuice** landing legal pages; support **hello@** shared inbox — confirm exact URLs before store submit.

**Your answer:**

---

## Already decided (confirm or override)

| Topic | Current decision |
|-------|------------------|
| Standard / pilot box price | $80 / $50 |
| Kids accounts | Tabled — hidden for pilot |
| Hanukkah Guide in app | No — print in box |
| Passover card hold | Tabled |
| Standard shipping | Free |
| Feedback complete reward | $80 platform credit |
| Non-responder fallback | $20 Amazon (after outreach — see Q5) |
| Reveal before payment | Yes |
| Reminder channels (concept) | Email and/or SMS and/or push |

**Overrides:**

---

*After you record your voice note, we’ll lock answers in this file and unblock the major builds.*
