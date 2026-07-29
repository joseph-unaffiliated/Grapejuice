# Airtable → Firestore catalog sync

**Source of truth:** Airtable base **Grapejuice** (`appQscrPCQUIj4shh`)

- **Full Catalog** (`tblCUCVfohWTQy8fP`) — SKUs with **In production? = Yes** and an **ID**
- **Hanukkah Books** (`tbleo48j2H34DRAu1`) — non-cut books

**Destination:** Firestore `catalog/hanukkah/items/{slugId}` (replace sync; orphans deleted)

**Images:** **Primary Image** → `imageUrl`; **Other Images** → `imageUrls` (mirrored to Firebase Storage when present)

**PDP details (Full Catalog):** **Dimensions**, **Materials**, **What’s Included**, **Care Notes** → Firestore `dimensions` / `materials` / `whatsIncluded` / `careNotes` (empty values omitted in the app)

## Pipeline

1. Edit Airtable (prices, copy, Primary/Other Images, production flag, books).
2. Cloud Function `syncAirtableCatalog` (or scheduled job) replace-syncs into Firestore.
3. The app listens with Firestore `onSnapshot` (`useCatalog`) — Home, My Box, product, and à la carte update live.

Latency: **scheduled every 5 minutes** when `AIRTABLE_PAT` is set. For near-immediate updates after an Airtable edit, hit the HTTP trigger (or wire an Airtable Automation “Run a script” that POSTs the same URL).

## Env (Functions)

In `functions/.env.grapejuice-pilot` (deployed with the project):

```bash
AIRTABLE_PAT=pat...          # Personal access token: data.records:read, schema.bases:read
AIRTABLE_BASE_ID=appQscrPCQUIj4shh   # optional; this is the default
CATALOG_SYNC_SECRET=...      # random string; Authorization: Bearer <secret>
```

Create the PAT at https://airtable.com/create/tokens — scope to the Grapejuice base.

## Manual sync

```bash
curl -X POST \
  -H "Authorization: Bearer $CATALOG_SYNC_SECRET" \
  "https://us-central1-grapejuice-pilot.cloudfunctions.net/syncAirtableCatalog"
```

(Confirm the URL in the Firebase console after first deploy.)

## Deploy

```bash
cd grapejuice/pilot-app/functions && npm run build
cd .. && firebase deploy --only functions:syncAirtableCatalog,functions:scheduledAirtableCatalogSync --project grapejuice-pilot
```

Do **not** use `scripts/seed-pilot-catalog.js` as additive SoT anymore — Airtable replace-sync owns the catalog.
