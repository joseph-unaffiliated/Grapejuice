# Guest box recovery via Retention.com leads

A signed-out visitor's in-progress Hanukkah box is mirrored to Firestore under a random
visitor id that also rides in the page URL. When Retention.com identifies that visitor, the
lead is linked to the saved box, added to the **Untraditional** Customer.io workspace, and
emailed a one-click link that restores the box fully built (kids' names and ages included).

```
visitor lands on grapejuice.co
  → public/index.html mints gj.vid (cookie + localStorage), adds ?gjv=<id> to the URL
  → src/hooks/useGuestSessionSync.ts saves the box to guestSessions/<id> (debounced, beacon at pagehide)
  → Retention ge.js reports landing_page_url (with gjv) → webhook magic.unaffiliated.co/retention
  → subscription-functions: BigQuery marker leadData.grapejuice + HMAC-signed forward
  → functions retentionLead: dedupe, link (gjv → clicked_at fallback), mint resume token,
    Customer.io Track API identify + event grapejuice_retention_lead
  → Untraditional campaigns email a link to https://grapejuice.co/?resume=<token>
  → src/navigation/ResumeLinkEffect.tsx restores the stores and opens My Box
```

## Pieces

| Where | What |
| --- | --- |
| `public/index.html` | `window.__gjVisitorId` (gj.vid / `gj_vid` cookie, `?gjv=`), Retention snippet verbatim + `geq.page()` |
| `public/robots.txt` | Real robots.txt (was the SPA HTML) |
| `src/navigation/stickyQuery.ts` | Keeps `gjv` (and `vge`/`aid`) on every in-app URL rewrite |
| `src/services/guest/visitorId.ts` | Read / adopt the visitor id |
| `src/services/guest/guestSessionSync.ts` | Snapshot builder, callables, beacon, kill switch, `applyGuestSnapshot` |
| `src/hooks/useGuestSessionSync.ts` | Signed-out, web-only sync (3s debounce, `pagehide` beacon) |
| `src/navigation/ResumeLinkEffect.tsx` | `/?resume=<token>` → restore + navigate |
| `src/services/guest/persistGuestToAccount.ts` | Calls `markGuestSessionConverted` on sign-up |
| `functions/src/guestSessions.ts` | `saveGuestSession`, `saveGuestSessionBeacon`, `markGuestSessionConverted`, `resumeGuestSession`, `deleteGuestDataByEmail`, `scheduledPurgeGuestSessions` |
| `functions/src/retentionLead.ts` | HMAC-verified lead endpoint, dedupe, linking, token, Customer.io |
| `functions/src/untraditionalCio.ts` | Track API helpers (identify / event / delete / exit signals) |
| `functions/src/welcome.ts`, `chargePilotBox.ts` | Exit signals `grapejuice_account`, `grapejuice_order_placed` |
| `firestore.rules` | `guestSessions`, `guestResumeTokens`, `retentionLeadEvents` denied to clients |
| subscription-functions `lib/grapejuice-lead.js`, `api/retention-webhook.js` | grapejuice.co branch |
| subscription-functions `api/retention-grapejuice-replay.js` | 15-min cron that re-forwards failed forwards |
| `scripts/guest-recovery-funnel.mjs` | Firestore funnel counts |

Firestore documents:

- `guestSessions/{visitorId}` — `snapshot` (guest + gift stores + entry context), `hasBox`,
  `hasGiftDraft`, `boxItemCount`, `kidCount`, `createdAt`, `updatedAt`, `expireAt` (60 days,
  renewed on resume), `convertedUid`, `lastLeadEmailHash`, `resumeCount`.
- `guestResumeTokens/{sha256(token)}` — `visitorId`, `emailHash`, `expiresAt` (30 days), `usedCount` (max 25).
- `retentionLeadEvents/{sha256(email|clicked_at)}` — dedupe + audit (`linked`, `hasBox`, `eventSent`, `status`).

## Configuration

### Firebase functions env (`functions/.env.grapejuice-pilot`, gitignored)

```
GJ_RETENTION_FORWARD_SECRET=<generated — already written locally>
UNTRADITIONAL_CIO_SITE_ID=<Untraditional workspace → Settings → API Credentials → Track API Keys>
UNTRADITIONAL_CIO_TRACK_API_KEY=<same screen>
GJ_APP_ORIGIN=https://grapejuice.co
```

Without the two Customer.io values, leads are still received, linked and stored (and the
funnel still reports them); only the identify/event calls are skipped with a warning.

### Vercel env (subscription-functions project)

```
GRAPEJUICE_RETENTION_FORWARD_URL=https://us-central1-grapejuice-pilot.cloudfunctions.net/retentionLead
GRAPEJUICE_RETENTION_FORWARD_SECRET=<same value as GJ_RETENTION_FORWARD_SECRET>
```

Until both are set the webhook records `forward.status = not_configured` and the replay cron
picks those leads up (48-hour lookback) once they are.

### Firestore TTL (optional; the daily purge function covers it)

```
gcloud firestore fields ttls update expireAt  --collection-group=guestSessions     --project=grapejuice-pilot
gcloud firestore fields ttls update expiresAt --collection-group=guestResumeTokens --project=grapejuice-pilot
```

### Kill switch

`config/features` document, field `guestSessionSync: false` — clients stop saving immediately,
no deploy. Missing document or field means on.

## Deploy order (staged)

1. **Hosting + rules + functions** (saving only, no emails yet — Customer.io env still empty):
   `npm run build:web` → deploy hosting; `firebase deploy --only firestore:rules,functions`.
   Confirm `guestSessions` documents appear for a guest test build, and that
   `grapejuice.co/robots.txt` is plain text.
2. **subscription-functions**: set the two Vercel env vars, push. Spot-check a newsletter lead
   in the Vercel logs afterwards (the `grapejuice` flag must be `false` for newsletter domains).
3. **Customer.io**: create the Track API key, fill `UNTRADITIONAL_CIO_*`, redeploy functions.
   Create the two automations below as drafts, review copy, start them.
4. Run `node scripts/guest-recovery-funnel.mjs` daily for the first week and the BigQuery
   check below to confirm `gjv` actually appears in `landing_page_url`.

## Customer.io automations (Untraditional workspace 208456)

Both are **event-triggered** on `grapejuice_retention_lead`, send from `Grapejuice <hello@grapejuice.co>`,
are marketing (unsubscribe link, respect unsubscribes), and use a frequency cap of one
recovery email per person per 14 days (workspace message limits or a `grapejuice_recovery_sent_at`
attribute check).

Exit conditions on both: person attribute `grapejuice_account = true` **or**
`grapejuice_order_placed = true` (also exit when the trigger filter no longer matches).

Event data available in Liquid: `event.has_box`, `event.resume_url`, `event.kid_count`,
`event.box_item_count`, `event.linked`. Person attributes: `grapejuice_has_box`,
`grapejuice_resume_url`, `grapejuice_kid_count`, `grapejuice_box_item_count`, `first_name`.

### A. "Your box is saved" — event filter `has_box = true`

1. Delay 1 hour.
2. Email — subject: **Your Hanukkah box is saved — pick up where you left off**
   Preheader: *Everything you chose is still here.*

   > {% if customer.first_name %}Hi {{ customer.first_name }},{% else %}Hi there,{% endif %}
   >
   > You started building a Hanukkah box on Grapejuice and we saved it for you — the picks,
   > the kids' ages, all of it. One tap brings it back exactly as you left it.
   >
   > **[Open my box]({{ event.resume_url }})**
   >
   > Nothing is ordered until you say so. If this wasn't you, just ignore this email and the
   > saved box disappears on its own after 60 days.
   >
   > — Grapejuice
   >
   > <small>You're receiving this because you visited grapejuice.co. [Unsubscribe]({% unsubscribe_url %}) · [Privacy](https://unaffiliated.co/privacy/network)</small>

3. Wait 3 days; **if the first email was not clicked**, email — subject:
   **Still thinking about it? Your box is waiting**

   > {% if customer.first_name %}Hi {{ customer.first_name }},{% else %}Hi there,{% endif %}
   >
   > Your Hanukkah box is still saved. Boxes lock for shipping a few days before the first
   > candle, so this is a good week to finish it.
   >
   > **[Pick up where I left off]({{ event.resume_url }})**
   >
   > — Grapejuice
   >
   > <small>[Unsubscribe]({% unsubscribe_url %}) · [Privacy](https://unaffiliated.co/privacy/network)</small>

### B. "Come build your box" — event filter `has_box = false`

1. Delay 2 hours.
2. Email — subject: **Build a Hanukkah box your kids will actually remember**
   Preheader: *Eight nights, done thoughtfully, in about ten minutes.*

   > {% if customer.first_name %}Hi {{ customer.first_name }},{% else %}Hi there,{% endif %}
   >
   > Thanks for stopping by Grapejuice. We build one Hanukkah box per family: candles and
   > a menorah, a dreidel, a book and a small gift for each kid, chosen for their ages and
   > interests — wrapped and labeled by night.
   >
   > Tell us about your kids and we'll put a first box together for you to edit.
   >
   > **[Build our box]({{ event.resume_url }})**
   >
   > — Grapejuice
   >
   > <small>You're receiving this because you visited grapejuice.co. [Unsubscribe]({% unsubscribe_url %}) · [Privacy](https://unaffiliated.co/privacy/network)</small>

## Privacy policy language (for https://unaffiliated.co/privacy/network)

Suggested additions under the Grapejuice / Untraditional section:

> **Saved boxes for visitors without an account.** When you start building a Grapejuice box
> without signing in, we save your progress — including the first names, ages and interests
> you enter for the children the box is for, and the items you choose — so you can return
> to it. This information is stored for up to 60 days (longer if you reopen it) and is
> deleted when you create an account, which then holds the box, or on request.
>
> **Identifying visitors.** We work with an identity partner, Retention.com, which may
> recognize visitors to grapejuice.co who have previously agreed to share their email
> address with its network. If we receive your email address this way, we may send you a
> small number of emails about the box you started or about Grapejuice. Every such email
> includes an unsubscribe link; unsubscribing stops them immediately. We never include
> children's names in these emails.
>
> **Your choices.** Email privacy@unaffiliated.co to have a saved box, the related
> identifiers, and your Grapejuice email profile deleted. Our team can do this in one step.

Operational note: deletion requests are served by the `deleteGuestDataByEmail` callable
(admin accounts only) — it removes matching `guestSessions`, `guestResumeTokens`,
`retentionLeadEvents` and the Untraditional Customer.io person.

## Monitoring

Firestore funnel (counts only):

```
node scripts/guest-recovery-funnel.mjs --days 7
```

BigQuery — grapejuice leads, forward status, and whether `gjv` is making it into `landing_page_url`:

```sql
SELECT
  DATE(recentClickDate) AS day,
  COUNT(*) AS leads,
  COUNTIF(REGEXP_CONTAINS(JSON_VALUE(leadData, '$.grapejuice.landing_page_url'), r'[?&]gjv=')) AS with_gjv,
  COUNTIF(JSON_VALUE(leadData, '$.grapejuice.forward.status') = 'sent') AS forwarded,
  COUNTIF(JSON_VALUE(leadData, '$.grapejuice.forward.status') IN ('failed', 'not_configured', 'pending')) AS forward_pending
FROM `analytics.users`
WHERE JSON_VALUE(leadData, '$.grapejuice.lead') = 'true'
  AND recentClickDate >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
GROUP BY day ORDER BY day DESC;
```

If `with_gjv` stays at zero while `leads` grows, Retention is capturing the URL before the
param exists (or stripping it); the `clicked_at` fallback carries the load and Retention
support should be asked when `landing_page_url` is captured.

Customer.io: automation metrics on the two automations above (sent / opened / clicked), and
people with `grapejuice_lead = true` vs `grapejuice_account = true` for conversion.

## Retention verification warning — remaining steps

Done in this build: real `robots.txt`; the collection snippet is now byte-for-byte the
dashboard version followed by `<script>geq.page()</script>`.

Still to do (outside the repo):

1. In the Retention dashboard, run "Test your script" with `https://www.thepicklereport.com`.
   Same orange warning there → it is an account-level status, not grapejuice.co.
2. Add `www.grapejuice.co` as a Firebase Hosting custom domain redirecting to the apex (it
   resolves in DNS but fails TLS today).
3. Support ticket with both HAR files, noting `script_beacon` returns 200 with
   `host=grapejuice.co`, `a_id=X2JHJ4WE`, and asking (a) whether a failed `verify_script`
   pauses collection or matching, (b) when `landing_page_url` is captured.
