import * as logger from './logger';
import { onCall, HttpsError } from './sentry';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HOLIDAY_ID, recomputeBoxAllocations, reserveBoxLinesInTx } from './catalogInventory';
import { isHanukkahBoxOrder } from './chargePilotBox';
import { restoreEligibility, type RestoreCheckoutReason } from './orderRestoreRules';

const ACTIVE_BOX_STATUSES = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];

export type RestorePilotBoxOrderResult =
  | { status: 'committed'; orderId: string; lockAt: string | null }
  | { status: 'needs_checkout'; orderId: string; reason: RestoreCheckoutReason; message: string };

/**
 * Undo cancelPilotBoxOrder: back to `committed` with the same items, address and saved card,
 * re-taking the credits cancel returned and re-holding box stock. The household's box draft is
 * reset to the order's items, since My Box syncs the draft onto a committed order (and the charge
 * at lock prices from the draft). When the card, address or credit is gone, the draft is still
 * reset and the client is sent through checkout instead.
 */
export const restorePilotBoxOrder = onCall(async (request): Promise<RestorePilotBoxOrderResult> => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = request.auth.uid;
  const householdId = String(request.data?.householdId ?? '').trim();
  const orderId = String(request.data?.orderId ?? '').trim();
  if (!householdId || !orderId) {
    throw new HttpsError('invalid-argument', 'householdId and orderId are required.');
  }

  const db = getFirestore();
  const householdRef = db.doc(`households/${householdId}`);
  const orderRef = db.doc(`households/${householdId}/orders/${orderId}`);
  const draftRef = db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`);
  const lockAt = ((await db.doc(`config/${HOLIDAY_ID}`).get()).data()?.lockAt as string | undefined) ?? null;

  type TxOutcome = { ok: true } | { ok: false; reason: RestoreCheckoutReason; message: string };
  const outcome = await db.runTransaction(async (tx): Promise<TxOutcome> => {
    const [householdSnap, orderSnap, otherOrders] = await Promise.all([
      tx.get(householdRef),
      tx.get(orderRef),
      tx.get(
        db.collection(`households/${householdId}/orders`).where('status', 'in', ACTIVE_BOX_STATUSES)
      ),
    ]);
    if (!householdSnap.exists) throw new HttpsError('not-found', 'Household not found.');
    const household = householdSnap.data() ?? {};
    const memberIds = Array.isArray(household.memberIds) ? (household.memberIds as string[]) : [];
    if (!memberIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'Not a member of this household.');
    }
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.');
    const order = orderSnap.data() ?? {};

    const verdict = restoreEligibility({
      order,
      isBoxOrder: isHanukkahBoxOrder(order),
      household,
      lockAt,
      otherActiveBox: otherOrders.docs.some((d) => d.id !== orderId && isHanukkahBoxOrder(d.data())),
    });
    if (!verdict.ok && verdict.code !== 'needs_checkout') {
      throw new HttpsError('failed-precondition', verdict.message, { code: verdict.code });
    }
    const checkout =
      !verdict.ok && verdict.code === 'needs_checkout'
        ? { ok: false as const, reason: verdict.reason, message: verdict.message }
        : null;

    const lineItems = order.lineItems as Array<{ itemId?: string; quantity?: number }>;
    const draftReset = {
      holidayId: HOLIDAY_ID,
      lineItems,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    if (checkout) {
      tx.set(draftRef, draftReset, { merge: true });
      return checkout;
    }

    let queueStockHolds = () => {};
    if (order.playthrough !== true) {
      try {
        queueStockHolds = await reserveBoxLinesInTx(db, tx, lineItems);
      } catch (err) {
        if (err instanceof HttpsError) {
          throw new HttpsError(
            'failed-precondition',
            `${err.message} Check out again with a swap to restore your box.`,
            { code: 'sold_out' }
          );
        }
        throw err;
      }
    }

    // All reads are done; writes only from here.
    queueStockHolds();
    tx.update(orderRef, {
      status: 'committed',
      lockAt,
      restoredAt: FieldValue.serverTimestamp(),
      restoredByUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const giftApplied =
      typeof order.giftCreditAppliedCents === 'number' ? order.giftCreditAppliedCents : 0;
    const platformApplied =
      typeof order.platformCreditAppliedCents === 'number' ? order.platformCreditAppliedCents : 0;
    if (giftApplied > 0 || platformApplied > 0) {
      tx.update(householdRef, {
        ...(giftApplied > 0 ? { giftCreditCents: FieldValue.increment(-giftApplied) } : {}),
        ...(platformApplied > 0 ? { platformCreditCents: FieldValue.increment(-platformApplied) } : {}),
        updatedAt: new Date().toISOString(),
      });
    }
    tx.set(draftRef, draftReset, { merge: true });
    return { ok: true };
  });

  if (!outcome.ok) {
    return { status: 'needs_checkout', orderId, reason: outcome.reason, message: outcome.message };
  }

  // cancelPilotBoxOrder turned the lock reminder back on; a committed box doesn't need it.
  await db.doc(`users/${uid}`).set(
    { lockReminderEligible: false, updatedAt: new Date().toISOString() },
    { merge: true }
  );

  try {
    const alloc = await recomputeBoxAllocations(db);
    logger.info('restorePilotBoxOrder box allocations', { orderId, ...alloc });
  } catch (allocErr) {
    logger.error('restorePilotBoxOrder recomputeBoxAllocations failed', { orderId, allocErr });
  }

  return { status: 'committed', orderId, lockAt };
});
