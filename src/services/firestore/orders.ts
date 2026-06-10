import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { PilotOrder, ShippingAddress, BoxLineItem } from '../../types/pilot';

function toOrder(id: string, data: Record<string, unknown>): PilotOrder {
  return {
    id,
    status: (data.status as PilotOrder['status']) ?? 'pending',
    lineItems: Array.isArray(data.lineItems) ? (data.lineItems as BoxLineItem[]) : [],
    totalCents: Number(data.totalCents ?? 0),
    shippingAddress: (data.shippingAddress as ShippingAddress) ?? {
      name: '',
      line1: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: 'US',
    },
    stripePaymentIntentId: data.stripePaymentIntentId as string | undefined,
    lockAt: (data.lockAt as string | null) ?? null,
    trackingNumber: (data.trackingNumber as string | null) ?? null,
    carrier: (data.carrier as string | null) ?? null,
    estimatedDelivery: data.estimatedDelivery as string | undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    confirmedAt: data.confirmedAt ? String(data.confirmedAt) : undefined,
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
