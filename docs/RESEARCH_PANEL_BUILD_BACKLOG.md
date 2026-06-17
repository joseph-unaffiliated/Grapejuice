# Research panel → build backlog

**Sources:** Research panels June 10 and June 17, 2026 (Gemini notes)  
**Reconciled with:** `PILOT_DECISIONS.md`, `GRAPEJUICE_TECHNICAL_BRIEF.md`, current `pilot-app` codebase  
**Status:** June 2026 — use for sprint planning after Build 1 polish

---

## Summary

Both panels **validate** the current pilot direction (parent-only app, bundled shipping, five-section box UI, minimal onboarding, curated à la carte, grandparent gifting as a growth channel). They **refine** several locked decisions (especially gift flow and debrief incentives) and add **new backlog items** (reminders, calendar, onboarding interests, surprise sections, light education).

Nothing in the panels requires abandoning Build 8 (`PILOT_PARENT_ONLY`) or the charge-at-ship model.

---

## Reconciliation table

| Topic | Locked decision / brief | Panel input (Jun 10 + 17) | Code today | Recommended action |
|-------|-------------------------|---------------------------|------------|-------------------|
| **Hanukkiah in box** | Curated catalog, not open store | **Exclude from default box**; buy separately; **6+ options**, wide price range | Hanukkiah via browse chips / swaps, not default slot | **Keep** — verify catalog has ≥6 hanukiah SKUs |
| **Box sections** | My Box customize | **Five sections** (candles, dreidel, food, presents, story) | `boxDisplaySections.ts` | **Done** (Figma 370:3514 alignment) |
| **Onboarding depth** | Kids + ages + familiarity | Same + **interest checkboxes** (crafts, reading, …) | 3 screens, no interest tags | **Add** — small curation boost (Tier 2) |
| **Kid app / voting** | Deferred post-pilot | **Strong no** for young kids; parent shows phone | `PILOT_PARENT_ONLY = true` | **Keep hidden** for pilot |
| **Shipping** | Free standard pilot | **Must be included** in price; surprise fees = abandonment | `SHIPPING_FLAT_CENTS = 0` | **Done** |
| **Pilot price** | $50 pilot / $80 list | Below **$60** pilot; panel ok with $50–$60 | `DEFAULT_BOX_PRICE_CENTS = 5000` | **Done** |
| **Pilot cohort** | 20–50 families (brief) | **30–60** families | N/A (ops) | **Ops** — align recruiting copy |
| **Subscription auto-ship** | Card on file = commitment; charge at ship | Annual auto-ship unless user customizes in window | Single-holiday commit + waitlist | **Messaging** for pilot; true subscription billing with Passover |
| **Expedited shipping** | Q2–Q3 deferred | Wanted for procrastinators; flat fee ok | Not built | **Build 3** — after lock reminders |
| **Reminders** | Q21 Customer.io SMS | **Text + link** preferred; clear lock countdown | Email partial; no SMS | **Tier 1** — in-app countdown + SMS templates |
| **Calendar** | Not in decisions | Tap holiday date → **add to calendar** | Not built | **Tier 1** — low effort, high panel ask |
| **In-app guide** | Q19 print only; `PILOT_HIDE_IN_APP_GUIDE` | **Light holiday primer** in app (Darlene, Vlad) | Guide route hidden | **Tier 2** — “About Hanukkah” sheet, not 8-night guide |
| **Q9 reveal copy** | “Refine your box” + payment pending | Figma toolbar only in latest UI | Copy removed from box screens | **Update Q9 note** — Figma-aligned toolbar; payment copy on checkout only |
| **Presents in core box** | Per-kid gifts in curation | **May blow $50–$80**; gifts → **gift shop / add-ons** | Presents section with per-kid items | **Tier 2** — thin default presents (wrap + books); push heirlooms to à la carte |
| **À la carte store** | Q14 hide store link | Curated **gift shop** ok; not in core box | `AlaCarteStore` exists, link hidden | **Keep** browse chips + rails; optional “gift shop” framing later |
| **Grandparent gift** | Q1 $50; Q11 fields; Q12 never expire; Q8 no recipient card if credited | **Giver first pass** (swap/add) → recipient reveal → recipient **surprise or customize**; gift credit / wish list | `giftCreditCents` only; no UI | **Build 2** — expand spec (see below) |
| **Keep surprise** | Not in decisions | Per-section **sealed until arrival**; disables swap for that section | Not built | **Tier 2** — needs ops “box within box” |
| **Item wrapping** | Not in decisions | Wrap dreidel / book / etc. | Not built | **Tier 3** or ops-only pilot |
| **Donate / tzedakah opt-out** | Not in decisions | Remove item → **donate value** to charity / subsidize boxes | Not built | **Post-pilot** — complex |
| **Dietary restrictions** | Not in decisions | **Gluten etc.** on food swaps | Not built | **Post-pilot** or onboarding field only |
| **Debrief incentive** | Q4 Firestore credit; Q5 Amazon fallback | **Voluntary** only; **$80 credit** primary; **$20 Amazon** after 2 weeks non-response | Survey saves; **no credit ledger**; Home promises $80 | **Tier 1** — implement credit OR soften Home copy |
| **Feedback mandatory** | — | **Do not** punitive clawback | No clawback | **Keep** voluntary model |
| **Section nav labels** | Holiday-specific (Hanukkah) | **Standardize** Play / Eat / Read across holidays | Hanukkah-specific nav labels | **2027** when Passover ships |
| **Storage / binder** | Physical product | **Add-on** post-checkout, not core | Not in app | **Ops / post-pilot** |
| **Recipe vault** | — | Save recipes year-over-year in account | Not built | **Post-pilot** (Joseph: “full recipe site”) |
| **Kid profiles** | Post-pilot | Skip for pilot | Coded, hidden | **No change** |
| **Marketing** | — | Influencer unboxing; **kids experience**; simple ads; subscription lists | N/A | **Ops** — not app build |

---

## Build 2 — grandparent flow (panel-upgraded spec)

**Still aligned with Q1, Q8, Q11, Q12.** Panels add interaction design:

### Giver (grandparent / gift purchaser)

1. Checkout at $50 (or credit amount: $50 box, $250 multi-holiday — future).
2. Collect: recipient email, giver name, message, **children ages** (giver may complete onboarding on behalf of family).
3. **Giver customization pass** (optional): see curated box, swap/add within window — “grandma picked this.”
4. Or **credit-only**: “$50 — let them choose” (skip giver curation).
5. Pay → `giftCreditCents` + gift order record + magic link (never expires).

### Recipient (parent household)

1. Email / link → **box reveal** (no full onboarding if giver supplied ages).
2. Fork:
   - **Keep surprise** (whole box or per-section) → no swaps for sealed parts.
   - **Customize** → full My Box experience; swaps until lock.
3. No card if `giftCreditCents >= box price` (Q8).
4. Commit / ship address as today.
5. **Debrief + incentives** accrue to recipient account, not giver.

### Engineering surfaces

| Layer | Work |
|-------|------|
| Firestore | `giftOrders`, `households.giftCreditCents`, giver draft snapshot, recipient claim state |
| Functions | Gift purchase (Stripe), claim link, merge draft into household |
| Client | Giver flow (Figma 16–17), recipient claim + reveal, surprise flags |
| Email | Customer.io gift notification + claim link |

---

## Prioritized backlog (engineering)

### Tier 1 — pilot credibility (do before real families)

| # | Item | Effort | Depends on |
|---|------|--------|------------|
| 1a | **Lock / ship countdown** on Home + box toolbar (days until lock, estimated delivery) | S | Config `lockAt` |
| 1b | **Add to calendar** link (Hanukkah start, lock date, delivery) | S | — |
| 1c | **Debrief → $80 platform credit** on `reflection` save (`household.platformCreditCents` or user ledger) | M | Q4 |
| 1d | **Honest copy** if 1c slips: remove “unlock $80” from Home until ledger exists | S | — |
| 1e | **Customer.io SMS** lock reminders (templates + link to My Box) | M | Q21, ops |
| 1f | **Production Stripe + webhook hardening** | M | — |
| 1g | **ShipStation** order export + tracking writeback | L | Ops SKUs |

### Tier 2 — panel delight (high value, moderate scope)

| # | Item | Effort | Depends on |
|---|------|--------|------------|
| 2a | **Onboarding interest checkboxes** → curation tags | S | Catalog tags |
| 2b | **Light “About Hanukkah”** (static primer, not 8-night guide) | S | Content |
| 2c | **Per-section “keep surprise”** flags on box draft | M | Fulfillment sealed inner box |
| 2d | **Thin presents section** in default curation (wrap + books; gifts à la carte) | M | Catalog / `buildDefaultBox` |
| 2e | **Build 2 grandparent flow** (giver pass + recipient claim) | L | Figma 16–17, Stripe |

### Tier 3 — post-pilot / ops-heavy

| Item | Notes |
|------|-------|
| Donate item value / tzedakah | Panel loved; product complexity high |
| Dietary restrictions on food | Onboarding field → filter swaps |
| Item-level gift wrapping | Checkbox at commit; warehouse |
| Cross-holiday nav labels (Play / Eat / Read) | Passover design |
| Recipe vault + Rav “what did I make last year?” | Separate product surface |
| Storage binder / Judaica box SKUs | Physical add-on post-checkout |
| Corporate gifting / wish lists | Business development |
| Kid profiles + voting | `PILOT_PARENT_ONLY = false` |
| Expedited tier (Build 3) | Second lock date + checkout SKU |

---

## Corrections to technical brief (§8.1)

| Brief claim | Correction |
|-------------|------------|
| “Firestore ledger exists” for $80 debrief credit | **Only `giftCreditCents`** exists today; debrief credit **not implemented** |
| Pilot 20–50 families | Panels discussed **30–60**; either is fine — document both |
| Grandparent flow “not built” | Accurate; panels add **two-pass customization** requirement |

---

## Suggested sprint order

1. **Quick wins (1–2 days):** 1a, 1b, 1d (if needed), 2a, 2b  
2. **Trust & money (1 week):** 1c, 1f, debrief outreach scaffolding (Q5)  
3. **Growth channel (2+ weeks):** 2e Build 2 gifting  
4. **Ops (parallel):** 1g ShipStation, 1e SMS, influencer boxes  

---

## References

| Doc | Path |
|-----|------|
| Locked decisions | `pilot-app/docs/PILOT_DECISIONS.md` |
| Technical brief | `grapejuice/docs/GRAPEJUICE_TECHNICAL_BRIEF.md` |
| Design inventory | `pilot-app/docs/FIGMA_DESIGN_INVENTORY.md` |
| Panel notes | `~/Downloads/Research Panel_*Untraditional*_2026_06_10` and `_06_17` |
