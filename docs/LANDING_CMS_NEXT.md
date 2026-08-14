# Landing CMS — next phase

**Status:** queued for morning follow-up (after modular landings + edit CMS shipped)

## Goal

Let ops **create and remove** marketing landing pages from admin — including **new URL slugs** — without a code deploy.

## Why it isn’t free yet

Each landing is still hand-wired: registry id → screen → stack route → dedicated `/slug` link effect. Admin today only edits that fixed set.

## Proposed lean v1

1. **Admin create** — id, path/slug, nav label, seed sections (blank or clone).
2. **Admin delete** — remove Firestore override (+ hide from list); protect reserved paths.
3. **One dynamic route** — generic `Landing` screen keyed by id/slug; collapse per-audience link effects into one path resolver (Firestore + code seeds).
4. **Footer / Test landings / mock flow** — pick up CMS-only pages from Firestore list.
5. **Keep special cases** — gift (`?path=`, `/gift/claim`) stay explicit.

## Out of scope for v1

- Image upload / Storage
- Non-admin public “create page”
- Fully deleting code-seeded audiences from the repo (seeds can remain as fallbacks)
