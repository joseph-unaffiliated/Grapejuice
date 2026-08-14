# Landing CMS — next phase

**Status:** shipped (create / delete + dynamic slugs)

## Goal

Let ops **create and remove** marketing landing pages from admin — including **new URL slugs** — without a code deploy.

## Done in this phase

1. **Admin create** — label, path/slug, blank or clone-from-seed → Firestore → editor
2. **Admin delete** — CMS-only pages removable; code seeds keep “Reset to code” only
3. **DynamicLanding** route + **LandingLinkEffect** — resolves seeds ∪ CMS paths (gift stays special)
4. **Footer / Test landings** — merge live catalog so CMS-only pages appear
5. **Reserved path validation** — blocks `/store`, `/product`, `/gift/claim`, etc.

## Follow-ups (optional)

- Image upload / Storage
- Soft-delete / archive instead of hard delete
- Collapse legacy per-audience stack screens entirely
- Popstate / client-side path changes without full reload
