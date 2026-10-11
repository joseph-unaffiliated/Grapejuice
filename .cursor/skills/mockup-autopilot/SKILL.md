---
name: mockup-autopilot
description: Loop that captures every phone screen next to its approved mockup, lists the visual differences, fixes them in the app, and repeats until the screens match. Use when the user asks to match the mobile mockups, close the design gap, or run /mockup-autopilot.
disable-model-invocation: true
---

# Mockup autopilot

Goal: every phone screen in the app matches its mockup in `design/mobile-mockups/` (layout, spacing, type, color, modules, copy), without changing desktop. Keep going pass after pass until the backlog in `design/mobile-mockups/FIDELITY.md` has nothing left under "Open". Do not stop to ask between passes.

## Ground rules

- The mockups are the spec for layout, spacing, type sizes and weights, colors, module order and copy. They are not the spec for icon artwork: keep the site's own icons (grapes logomark, Rav icon, favorite heart, Font Awesome icons).
- Real data wins over mockup sample data: real prices, real product names, real dates. Never show remaining inventory counts ("6 left"); "Low stock" is the most the shopper sees.
- Everything ships behind `useMobileLayout()` / the `src/components/mobile` tokens. Desktop must not change: the desktop gate has to pass before every deploy.
- Never touch inventory, orders or payments while testing. Test accounts are `joseph+test-<purpose>@unaffiliated.co`.
- Known intentional differences are listed in FIDELITY.md under "Keep". Don't re-open them.

## One pass

1. Make sure the Expo web dev server is running: `npx expo start --web --port 8081` (background). Warm it once by loading `http://localhost:8081/?mbx=new`.
2. Capture: `node scripts/mockup-fidelity/run.mjs` (all pairs) or `--only id,id` for the screens you just touched. Output: `tmp/fidelity/latest/<id>-<n>.png`, mockup left, app right, one image per scrolled screen. Raw 2x captures are in `raw/` for zooming in.
3. Read every composite for the screens in scope. For each difference write one line in FIDELITY.md under "Open": screen, what the mockup does, what the app does. Be as picky as the user: spacing, edge-to-edge vs padded, radius, font size and weight, color, missing or extra modules, copy, sticky behavior, overlaps.
4. Fix the highest-leverage items first: shared components and tokens (`mobileTheme.ts`, `MobileButton`, `ProductTileMobile`, `StickyBar`, `TaskHeader`, `BoxSummary`, storefront chrome) before single screens. Mockup CSS is in `design/mobile-mockups/shared.css` and `pages.css`; page markup is in each page's HTML and `shared.js`. Copy exact values from there.
5. Re-capture the touched screens and confirm each fix visually. Move fixed lines to "Done".
6. Type-check (`npx tsc --noEmit`) and run any tests near the code you changed.
7. Every few passes, or when a batch is coherent, ship it:
   - `npm run build:web`, then `npm run shots:serve` (background) and `npm run shots:current && npm run shots:gate`. The gate must report no desktop changes.
   - Commit with the required author (`GIT_AUTHOR_NAME="joseph-unaffiliated" GIT_AUTHOR_EMAIL="joseph@unaffiliated.co"`, same for committer), push, `npx firebase-tools deploy --only hosting --project grapejuice-pilot`.
   - Re-run the capture with `--base https://grapejuice.co` to confirm production matches.
8. Start the next pass.

## Adding screens

Add pairs to `scripts/mockup-fidelity/pairs.mjs`. `guest: true` loads the guest box fixture (`scripts/flows/fixtures/mockup-guest.storage.json`; refresh it with `GJ_BASE_URL=http://localhost:8081 node scripts/flows/guest-box.mjs mockup-guest` if the box looks wrong). `click` taps a button by accessible name after load. The index of every mockup screen is `design/mobile-mockups/index.html`.

## Reporting

After each shipped batch, tell the user in two or three sentences what changed and what's next, with one composite image inline. When the backlog is empty, say so and list anything left in "Keep" or "Blocked".
