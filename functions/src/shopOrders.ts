import type { DocumentData } from 'firebase-admin/firestore';
import { isTest } from './testAccounts';

/**
 * Storefront (no-box) orders for the admin Orders and Inventory page: `orders` docs with
 * orderType 'marketplace'. Admin-only, so buyer name and email are included.
 */

const PAID = ['confirmed', 'shipped', 'delivered'];

export type DashShopLine = { itemId: string | null; name: string; qty: number; unitCents: number };

export type DashShopOrder = {
  id: string;
  orderId: string;
  /** What the buyer sees on their order page. */
  orderNumber: string;
  householdId: string;
  createdAt: string | null;
  paidAt: string | null;
  buyer: string | null;
  email: string | null;
  /** Checked out signed out (an account is made for them from the email). */
  guest: boolean;
  test: boolean;
  playthrough: boolean;
  /** pending / committed / confirmed / shipped / delivered / cancelled / refunded */
  status: string;
  /** Money was taken (refunds don't undo this). */
  paid: boolean;
  /** Never paid: still pending, or cancelled before payment (stale hold, failed checkout). */
  abandoned: boolean;
  cancelReason: string | null;
  chargeTiming: 'checkout' | 'lock' | null;
  chargeFailure: string | null;
  lines: DashShopLine[];
  units: number;
  subtotalCents: number | null;
  discountCents: number;
  creditCents: number;
  shippingCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  refundedCents: number;
  promo: string | null;
  attribution: string | null;
  location: string | null;
  fulfillment: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toISOString();
  return null;
}

export function shopOrderState(o: DocumentData): Pick<DashShopOrder, 'status' | 'paid' | 'abandoned' | 'fulfillment'> {
  const base = str(o.status) ?? 'unknown';
  const total = num(o.totalCents) ?? 0;
  const refunded = num(o.refundedCents) ?? 0;
  const paid = PAID.includes(base) || (base === 'cancelled' && Boolean(o.confirmedAt));
  const status = refunded > 0 && refunded >= total && total > 0 ? 'refunded' : base;
  const abandoned = !paid && (base === 'pending' || base === 'cancelled');
  let fulfillment = '—';
  if (str(o.trackingNumber) || base === 'shipped' || base === 'delivered') fulfillment = base === 'delivered' ? 'Delivered' : 'Shipped';
  else if (o.playthrough === true) fulfillment = 'Not shipped (playthrough)';
  else if (o.marketplaceFulfilledAt) fulfillment = 'Sent to ShipStation';
  else if (status === 'refunded' || base === 'cancelled') fulfillment = '—';
  else if (paid || base === 'committed') fulfillment = 'Ships after box lock';
  return { status, paid, abandoned, fulfillment };
}

function promoLabel(p: unknown): string | null {
  if (!p || typeof p !== 'object') return null;
  const promo = p as Record<string, unknown>;
  const parts: string[] = [];
  if (promo.source === 'code' && str(promo.code)) parts.push(`Code ${promo.code}`);
  const slug = str(promo.influencerSlug);
  if (slug) parts.push(`@${slug}${promo.selfReferral ? ' (own link)' : ''}`);
  return parts.length ? parts.join(' · ') : null;
}

export function buildShopOrder(input: {
  householdId: string;
  orderId: string;
  order: DocumentData;
  user: { email: string | null; name: string | null } | null;
  itemNames: Map<string, string>;
  attribution: string | null;
  location: string | null;
}): DashShopOrder {
  const { householdId, orderId, order: o, user } = input;
  const lines: DashShopLine[] = (Array.isArray(o.lineItems) ? o.lineItems : []).filter(Boolean).map((li: DocumentData) => {
    const itemId = str(li.itemId);
    return {
      itemId,
      name: (itemId && input.itemNames.get(itemId)) || str(li.label) || itemId || '?',
      qty: Math.max(1, Math.floor(Number(li.quantity) || 1)),
      unitCents: num(li.unitCents) ?? 0,
    };
  });
  const email = str(o.guestEmail) ?? user?.email ?? str(o.shippingAddress?.email);
  const timing = o.chargeTiming === 'checkout' || o.chargeTiming === 'lock' ? o.chargeTiming : null;
  return {
    id: `${householdId}/${orderId}`,
    orderId,
    orderNumber: orderId.slice(0, 8).toUpperCase(),
    householdId,
    createdAt: iso(o.createdAt),
    paidAt: iso(o.confirmedAt),
    buyer: str(o.shippingAddress?.name) ?? user?.name ?? null,
    email,
    guest: o.checkoutSignedOut === true || Boolean(str(o.guestEmail)),
    test: isTest(email, user?.email),
    playthrough: o.playthrough === true,
    ...shopOrderState(o),
    cancelReason: str(o.cancelReason),
    chargeTiming: timing,
    chargeFailure: str(o.chargeFailureMessage),
    lines,
    units: lines.reduce((s, l) => s + l.qty, 0),
    subtotalCents: num(o.subtotalCents),
    discountCents: num(o.discountCents) ?? 0,
    creditCents:
      num(o.creditAppliedCents) ?? (num(o.giftCreditAppliedCents) ?? 0) + (num(o.platformCreditAppliedCents) ?? 0),
    shippingCents: num(o.shippingCents),
    taxCents: num(o.taxCents),
    totalCents: num(o.totalCents),
    refundedCents: num(o.refundedCents) ?? 0,
    promo: promoLabel(o.promo),
    attribution: input.attribution,
    location: input.location,
    trackingNumber: str(o.trackingNumber),
    carrier: str(o.carrier),
    shippedAt: iso(o.shippedAt),
  };
}
