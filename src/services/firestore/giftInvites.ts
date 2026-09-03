import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { BoxLineItem, GiftInvite } from '../../types/pilot';

function toGiftInvite(id: string, data: Record<string, unknown>): GiftInvite {
  return {
    id,
    giverUid: String(data.giverUid ?? ''),
    giverName: String(data.giverName ?? ''),
    giverEmail: String(data.giverEmail ?? ''),
    recipientEmail: String(data.recipientEmail ?? ''),
    message: typeof data.message === 'string' ? data.message : undefined,
    creditCents: Number(data.creditCents ?? 0),
    claimToken: String(data.claimToken ?? ''),
    status: data.status === 'claimed' ? 'claimed' : 'pending',
    paymentStatus: data.paymentStatus === 'paid' ? 'paid' : 'pending',
    claimEmailSentAt: data.claimEmailSentAt ? String(data.claimEmailSentAt) : undefined,
    lineItems: Array.isArray(data.lineItems) ? (data.lineItems as BoxLineItem[]) : undefined,
    childInterests: Array.isArray(data.childInterests)
      ? (data.childInterests as string[])
      : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : new Date(0).toISOString(),
    claimedAt: data.claimedAt ? String(data.claimedAt) : undefined,
    claimedByHouseholdId:
      typeof data.claimedByHouseholdId === 'string' ? data.claimedByHouseholdId : undefined,
  };
}

export const giftInvitesService = {
  async listForGiver(giverUid: string): Promise<GiftInvite[]> {
    if (!db || !giverUid) return [];
    // No orderBy — avoids composite index requirement; sort client-side.
    const q = query(collection(db, 'giftInvites'), where('giverUid', '==', giverUid));
    const snap = await getDocs(q);
    const invites = snap.docs.map((d) => toGiftInvite(d.id, d.data() as Record<string, unknown>));
    invites.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return invites;
  },
};
