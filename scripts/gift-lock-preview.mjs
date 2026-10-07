#!/usr/bin/env node
/**
 * Read-only: what the lock-time gift settlement (runSettleUnconfirmedGiftBoxes +
 * runExportHeldGiftOrders in functions/src/index.ts) would do if lock passed now.
 * Prints counts only; writes nothing.
 *
 *   node scripts/gift-lock-preview.mjs [--firebase-cli-login]
 */
import admin from 'firebase-admin';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot';
let db;
if (process.argv.includes('--firebase-cli-login')) {
  db = firestoreFromFirebaseCliLogin(projectId);
  if (!db) {
    console.error('No usable `firebase login` session found.');
    process.exit(1);
  }
} else {
  admin.initializeApp({ projectId });
  db = admin.firestore();
}

const complete = (a) => Boolean(a?.name && a.line1 && a.city && a.stateProvince && a.postalCode);
const kindOf = (invite) =>
  invite.kind === 'box' || invite.kind === 'credit'
    ? invite.kind
    : Array.isArray(invite.lineItems) && invite.lineItems.length
      ? 'box'
      : 'credit';

const counts = {
  claimedUnconfirmed_shipToGiverAddress: 0,
  claimedUnconfirmed_becomeCredit: 0,
  unclaimed_shipToGiverAddress: 0,
  unclaimed_creditWhenClaimed: 0,
  confirmedGiftOrders_heldForLock: 0,
  confirmedGiftOrders_alreadySent: 0,
};

const received = await db.collectionGroup('receivedGifts').get();
for (const doc of received.docs) {
  const g = doc.data();
  if (g.kind !== 'box') continue;
  const open = g.status === 'available' || (g.status === 'accepted' && !g.checkoutOrderId);
  if (!open) continue;
  if (complete(g.giverShippingAddress)) counts.claimedUnconfirmed_shipToGiverAddress += 1;
  else counts.claimedUnconfirmed_becomeCredit += 1;
}

const invites = await db.collection('giftInvites').get();
for (const doc of invites.docs) {
  const i = doc.data();
  if (kindOf(i) !== 'box') continue;
  const paid = i.paymentStatus === 'paid' || Boolean(i.claimEmailSentAt);
  if (!paid || i.status === 'claimed' || i.autoShipOrderId) continue;
  if (complete(i.shippingAddress)) counts.unclaimed_shipToGiverAddress += 1;
  else counts.unclaimed_creditWhenClaimed += 1;
}

// Filtered in memory: a collection-group equality query would need a collection-group index.
const orders = await db.collectionGroup('orders').get();
for (const doc of orders.docs) {
  const o = doc.data();
  if (o.orderType !== 'received_gift' || o.status !== 'confirmed' || o.playthrough === true) continue;
  if (o.marketplaceFulfilledAt) counts.confirmedGiftOrders_alreadySent += 1;
  else counts.confirmedGiftOrders_heldForLock += 1;
}

console.log(counts);
