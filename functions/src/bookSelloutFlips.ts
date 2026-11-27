import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { CATALOG_HOLIDAY, recomputeBoxAllocations } from './catalogInventory';
import { runAirtableCatalogReplaceSync } from './airtableCatalogSync';

/**
 * Phase-2 sell-out flips for the non-Prime books (plan: book_sell-out_rollout).
 * Each flip, at its fixed ET slot: recompute committed copies (secured boxes +
 * paid gifts), set Airtable Inventory = committed + set aside (Hold inventory stays
 * checked), resync the catalog, and verify the book reads sold out. Drafts are
 * then swapped by the 30-min inventory watch. Runs entirely server-side; state
 * in bookSelloutFlips/{itemId} so a flip never runs twice.
 *
 * Times are UTC (EDT = UTC-4). To cancel a flip, delete its entry here and
 * redeploy, or set bookSelloutFlips/{itemId} to { status: 'cancelled' }.
 */
const AIRTABLE_BASE = 'appQscrPCQUIj4shh';
const FULL_CATALOG_TABLE = 'tblCUCVfohWTQy8fP';
const F = { inventory: 'fldXpTJPasuaXfoeW', hold: 'fldFpeHc3sxneJ1TH' };
const STATE_COLLECTION = 'bookSelloutFlips';

/**
 * Retired Nov 27, 2026. The six Oct 23–25 flips (story-of-hanukkah 10/23 10:22 ET, hanukkah-hop
 * 10/23 3:36 PM, nathan-blows-out 10/24 10:22, latke-who-couldn-t-stop-screaming 10/24 3:36,
 * rugrats-chanukah 10/25 10:22, ava-s-homemade-hanukkah 10/25 3:36) never ran: AIRTABLE_PAT is
 * read-only (the catalog sync only needs records:read), so every PATCH returned 403 and the job
 * retried every 5 minutes. Airtable was already set to the committed count with Hold on, so the
 * flips were cancelled in Firestore rather than fixed. A future flip needs a PAT with
 * data.records:write on the catalog table.
 */
export const BOOK_SELLOUT_FLIPS: Array<{ itemId: string; at: string }> = [];

const MAX_FLIP_ATTEMPTS = 3;
const FLIP_RETRY_BACKOFF_MS = 60 * 60 * 1000;

async function flipOneBook(db: Firestore, itemId: string): Promise<void> {
  const stateRef = db.doc(`${STATE_COLLECTION}/${itemId}`);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const data = snap.data();
    const status = data?.status;
    if (status === 'done' || status === 'cancelled') return false;
    // A flip that died mid-run stays 'running'. Retry it once the attempt is stale.
    if (status === 'running') {
      const started = data?.startedAt?.toMillis?.() ?? 0;
      if (Date.now() - started < 15 * 60 * 1000) return false;
    }
    // A failed flip retries a few times, an hour apart, then waits for a human (a permissions
    // error otherwise repeats every 5 minutes forever and floods Sentry).
    const attempts = Number(data?.attempts) || 0;
    if (status === 'failed') {
      if (attempts >= MAX_FLIP_ATTEMPTS) return false;
      const failedAt = data?.failedAt?.toMillis?.() ?? 0;
      if (Date.now() - failedAt < FLIP_RETRY_BACKOFF_MS) return false;
    }
    tx.set(stateRef, { status: 'running', startedAt: Timestamp.now(), attempts: attempts + 1 }, { merge: true });
    return true;
  });
  if (!claimed) return;

  try {
    const pat = process.env.AIRTABLE_PAT?.trim();
    if (!pat) throw new Error('AIRTABLE_PAT unset');

    await recomputeBoxAllocations(db);
    const [itemSnap, invSnap] = await Promise.all([
      db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`).get(),
      db.doc(`catalog/${CATALOG_HOLIDAY}/inventory/${itemId}`).get(),
    ]);
    if (!itemSnap.exists) throw new Error(`catalog item ${itemId} missing`);
    const item = itemSnap.data() ?? {};
    const recordId = typeof item.airtableRecordId === 'string' ? item.airtableRecordId : '';
    if (!recordId) throw new Error(`catalog item ${itemId} has no airtableRecordId`);
    const committed = Math.max(0, Math.floor(Number(invSnap.data()?.boxAllocatedQty) || 0));
    const setAside = Math.max(0, Math.floor(Number(item.setAside) || 0));

    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${FULL_CATALOG_TABLE}/${recordId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [F.inventory]: committed + setAside, [F.hold]: true }, typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable update ${res.status}: ${await res.text()}`);

    await runAirtableCatalogReplaceSync();

    const after = (await db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`).get()).data() ?? {};
    const counters = (await db.doc(`catalog/${CATALOG_HOLIDAY}/inventory/${itemId}`).get()).data() ?? {};
    const held = Math.max(0, Math.floor(Number(counters.boxAllocatedQty) || 0));
    const kept = Math.max(0, Math.floor(Number(after.setAside) || 0));
    const stockLeft = typeof after.inventory === 'number' ? after.inventory - kept - held : null;
    await stateRef.set(
      {
        status: 'done',
        committed,
        stockLeft,
        flippedAt: Timestamp.now(),
        verified: stockLeft === 0,
      },
      { merge: true }
    );
    logger.info('bookSelloutFlips: flipped', { itemId, committed, stockLeft });
  } catch (err) {
    await stateRef.set(
      { status: 'failed', error: String(err).slice(0, 300), failedAt: Timestamp.now() },
      { merge: true }
    );
    logger.error(`bookSelloutFlips: flip failed for ${itemId}: ${String(err).slice(0, 300)}`, { itemId });
  }
}

export const scheduledBookSelloutFlips = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'America/New_York', memory: '1GiB', timeoutSeconds: 540 },
  async () => {
    const now = Date.now();
    const due = BOOK_SELLOUT_FLIPS.filter((f) => now >= Date.parse(f.at));
    if (!due.length) return;
    const db = getFirestore();
    for (const flip of due) {
      await flipOneBook(db, flip.itemId);
    }
  }
);
