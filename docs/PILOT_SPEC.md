# Grapejuice Hanukkah 2026 pilot

**Product name:** Grapejuice (by Untraditional — parent brand only in metadata/legal, not in-app qualifier)  
**Code:** `grapejuice/pilot-app/`  
**Bundle ID:** `app.grapejuice`  
**Firebase:** `grapejuice-pilot` (created; separate from commerce `untraditional-commerce`)

## Preserved commerce app

`grapejuice/app/` — unchanged baseline. See [COMMERCE_BASELINE.md](./COMMERCE_BASELINE.md).

## Locked decisions

| Topic | Decision |
|--------|----------|
| Brand | Grapejuice only in UI; “by Untraditional” in store/legal if needed |
| Bundle ID | `app.grapejuice` |
| Lock date | **Fixed calendar date** (config per holiday) |
| Kid experience | **Profiles hub** on parent session — tap a child profile to enter kid theme; exit via profile switcher. No separate Firebase child auth in pilot (Beam Stage 1). |
| Kid Rav | Optional per child (`ravEnabled`); kid-safe mode only — no box mutations, no checkout. Parent can read kid Rav threads in pilot (Beam will partition later). |
| Rav (parent) | May change any app state **except** confirming/charging orders |
| Passover interest | Name + **Stripe card hold** (no charge now; penalty if cancel after cutoff — configure %) |
| Email | **Customer.io** (port from `untraditional-app` functions) |
| Platforms | iOS + Android + web (Expo) |

## Navigation (pilot)

1. **Home** — phase: countdown, shipping, reflection, Passover teaser  
2. **My Box** — curated config, swaps until lock, order status  
3. **Rav** — chat + thread history, tools (no checkout confirm)  
4. **Guide** — 8 nights (parent accordion; kid profile gets tonight-focused view)  
5. **Account** — household, profiles switcher, notifications, orders, track package  
6. **Profiles** — parent + children; per-child Allow Rav; tap child to enter kid experience  
7. **My Box voting** — thumbs-up on story/gift options (kids + adults); parent wraps gifts as surprises  

No marketplace Browse tab for Hanukkah.

## Build phases

See original Cursor build prompt (June 2026) plus amendments in chat. Implementation order in `pilot-app/README.md`.
