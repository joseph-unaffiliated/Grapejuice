import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { PilotOrder, ShippingAddress, BoxLineItem } from '../../types/pilot';

function toOrder(id: string, data: Record<string, unknown>): PilotOrder {
  const orderTypeRaw = typeof data.orderType === 'string' ? data.orderType : '';
  const orderType =
    orderTypeRaw === 'marketplace' || orderTypeRaw === 'received_gift'
      ? orderTypeRaw
      : orderTypeRaw === 'hanukkah_box'
        ? 'hanukkah_box'
        : undefined;
  return {
    id,
    status: (data.status as PilotOrder['status']) ?? 'pending',
    orderType,
    giftInviteId: data.giftInviteId ? String(data.giftInviteId) : undefined,
    lineItems: Array.isArray(data.lineItems) ? (data.lineItems as BoxLineItem[]) : [],
    totalCents: Number(data.totalCents ?? 0),
    subtotalCents: typeof data.subtotalCents === 'number' ? data.subtotalCents : undefined,
    shippingCents: typeof data.shippingCents === 'number' ? data.shippingCents : undefined,
    taxCents: typeof data.taxCents === 'number' ? data.taxCents : undefined,
    shippingAddress: (data.shippingAddress as ShippingAddress) ?? {
      name: '',
      line1: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: 'US',
    },
    stripePaymentIntentId: data.stripePaymentIntentId as string | undefined,
    giftCreditAppliedCents:
      typeof data.giftCreditAppliedCents === 'number' ? data.giftCreditAppliedCents : undefined,
    platformCreditAppliedCents:
      typeof data.platformCreditAppliedCents === 'number'
        ? data.platformCreditAppliedCents
        : undefined,
    lockAt: (data.lockAt as string | null) ?? null,
    trackingNumber: (data.trackingNumber as string | null) ?? null,
    carrier: (data.carrier as string | null) ?? null,
    estimatedDelivery: data.estimatedDelivery as string | undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    confirmedAt: data.confirmedAt ? String(data.confirmedAt) : undefined,
    cancelledAt: data.cancelledAt ? String(data.cancelledAt) : undefined,
    chargeAttemptedAt: data.chargeAttemptedAt ? String(data.chargeAttemptedAt) : undefined,
    chargeFailedAt: data.chargeFailedAt ? String(data.chargeFailedAt) : undefined,
    chargeFailureMessage:
      typeof data.chargeFailureMessage === 'string' ? data.chargeFailureMessage : undefined,
  };
}

export const ordersService = {
  async listForHousehold(householdId: string): Promise<PilotOrder[]> {
    if (!db) return [];
    const q = query(collection(db, 'households', householdId, 'orders'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toOrder(d.id, d.data() as Record<string, unknown>));
  },

  async get(householdId: string, orderId: string): Promise<PilotOrder | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'households', householdId, 'orders', orderId));
    if (!snap.exists()) return null;
    return toOrder(snap.id, snap.data() as Record<string, unknown>);
  },

  subscribe(householdId: string, orderId: string, cb: (order: PilotOrder | null) => void): () => void {
    if (!db) {
      cb(null);
      return () => {};
    }
    return onSnapshot(doc(db, 'households', householdId, 'orders', orderId), (snap) => {
      cb(snap.exists() ? toOrder(snap.id, snap.data() as Record<string, unknown>) : null);
    });
  },
};
