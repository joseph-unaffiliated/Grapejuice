import { householdsService } from '../firestore/households';
import { ordersService } from '../firestore/orders';
import type { PilotOrder } from '../../types/pilot';

export type FailedBoxSnapshot = {
  orderId: string;
  chargeFailedAt?: string;
  chargeAttemptCount: number;
  lockPassed: boolean;
};

function isHanukkahBox(order: PilotOrder): boolean {
  return order.orderType !== 'marketplace' && order.orderType !== 'received_gift';
}

export async function snapshotFailedBoxCharges(householdId: string): Promise<FailedBoxSnapshot[]> {
  const orders = await ordersService.listForHousehold(householdId);
  return orders
    .filter(
      (order) =>
        isHanukkahBox(order) &&
        (order.status === 'committed' || order.status === 'pending') &&
        !!order.chargeFailureMessage
    )
    .map((order) => ({
      orderId: order.id,
      chargeFailedAt: order.chargeFailedAt,
      chargeAttemptCount: order.chargeAttemptCount ?? 0,
      lockPassed: !!order.lockAt && Date.now() >= new Date(order.lockAt).getTime(),
    }));
}

async function waitForNewCard(
  householdId: string,
  previousCardOnFileAt: string | undefined,
  previousPaymentMethodId: string | undefined,
  refresh: () => Promise<void>
): Promise<boolean> {
  for (let i = 0; i < 15; i += 1) {
    await refresh();
    const household = await householdsService.get(householdId);
    const cardChanged = !!household?.cardOnFileAt && household.cardOnFileAt !== previousCardOnFileAt;
    const methodChanged =
      !!household?.stripeDefaultPaymentMethodId &&
      household.stripeDefaultPaymentMethodId !== previousPaymentMethodId;
    if (cardChanged || methodChanged) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export type ChargeRetryResult =
  | { kind: 'saved' }
  | { kind: 'confirmed' }
  | { kind: 'declined'; message: string }
  | { kind: 'pending' }
  | { kind: 'card_saved_unconfirmed' };

/** Wait until the new card is on the household, then until a past-lock retry finishes. */
export async function finishCardUpdate(params: {
  householdId: string;
  previousCardOnFileAt?: string;
  previousPaymentMethodId?: string;
  refresh: () => Promise<void>;
  snapshots: FailedBoxSnapshot[];
}): Promise<ChargeRetryResult> {
  const cardReady = await waitForNewCard(
    params.householdId,
    params.previousCardOnFileAt,
    params.previousPaymentMethodId,
    params.refresh
  );
  if (!cardReady) return { kind: 'card_saved_unconfirmed' };

  const retrying = params.snapshots.filter((snap) => snap.lockPassed);
  if (retrying.length === 0) return { kind: 'saved' };

  for (let i = 0; i < 20; i += 1) {
    for (const snap of retrying) {
      const order = await ordersService.get(params.householdId, snap.orderId);
      if (!order) continue;
      if (order.status === 'confirmed' || order.status === 'shipped' || order.status === 'delivered') {
        return { kind: 'confirmed' };
      }
      const attempt = order.chargeAttemptCount ?? 0;
      if (attempt <= snap.chargeAttemptCount) continue;
      if (order.chargeFailureMessage && order.chargeFailedAt && order.chargeFailedAt !== snap.chargeFailedAt) {
        return { kind: 'declined', message: order.chargeFailureMessage };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return { kind: 'pending' };
}

export function chargeRetryCopy(result: ChargeRetryResult): string {
  switch (result.kind) {
    case 'confirmed':
      return 'Your new card went through. This box is paid.';
    case 'saved':
      return 'Card saved. We’ll charge it when your box locks.';
    case 'declined':
      return result.message;
    case 'pending':
      return 'Card saved. The charge is still processing. Check Orders in a moment.';
    case 'card_saved_unconfirmed':
      return 'Card saved. It can take a moment to show up. Check Orders if the charge doesn’t update.';
  }
}
