import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { BoxLineItem, ReceivedGift, ReceivedGiftStatus } from '../../types/pilot';

function toReceivedGift(id: string, data: Record<string, unknown>): ReceivedGift {
  const statusRaw = String(data.status ?? 'available');
  const status: ReceivedGiftStatus =
    statusRaw === 'converted_to_credit' || statusRaw === 'accepted' || statusRaw === 'available'
      ? statusRaw
      : 'available';

  return {
    id,
    giftInviteId: String(data.giftInviteId ?? id),
    giverName: String(data.giverName ?? ''),
    message: typeof data.message === 'string' ? data.message : undefined,
    kind: data.kind === 'box' ? 'box' : 'credit',
    creditCents: Number(data.creditCents ?? 0),
    prepaidAddOnCents:
      data.prepaidAddOnCents != null && Number.isFinite(Number(data.prepaidAddOnCents))
        ? Math.max(0, Math.round(Number(data.prepaidAddOnCents)))
        : undefined,
    lineItems: Array.isArray(data.lineItems) ? (data.lineItems as BoxLineItem[]) : undefined,
    status,
    claimedAt: String(data.claimedAt ?? ''),
    viewedAt: data.viewedAt ? String(data.viewedAt) : undefined,
    convertedAt: data.convertedAt ? String(data.convertedAt) : undefined,
    acceptedAt: data.acceptedAt ? String(data.acceptedAt) : undefined,
    checkoutOrderId: data.checkoutOrderId ? String(data.checkoutOrderId) : undefined,
  };
}

export const receivedGiftsService = {
  async listForHousehold(householdId: string): Promise<ReceivedGift[]> {
    if (!db || !householdId) return [];
    const snap = await getDocs(collection(db, `households/${householdId}/receivedGifts`));
    const gifts = snap.docs.map((d) => toReceivedGift(d.id, d.data() as Record<string, unknown>));
    gifts.sort((a, b) => Date.parse(b.claimedAt) - Date.parse(a.claimedAt));
    return gifts;
  },
};

export function mergeReceivedGifts(a: ReceivedGift[], b: ReceivedGift[]): ReceivedGift[] {
  const map = new Map<string, ReceivedGift>();
  for (const gift of [...a, ...b]) {
    const key = gift.giftInviteId || gift.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, gift);
      continue;
    }
    if (Date.parse(gift.claimedAt) >= Date.parse(existing.claimedAt)) {
      map.set(key, { ...existing, ...gift, id: gift.id || existing.id });
    }
  }
  return [...map.values()].sort((x, y) => Date.parse(y.claimedAt) - Date.parse(x.claimedAt));
}
