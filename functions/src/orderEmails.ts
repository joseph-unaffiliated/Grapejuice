/** Order confirmation emails: which Customer.io template an order gets, and its item list. */
import type { DocumentReference } from 'firebase-admin/firestore';

export type OrderConfirmationTemplate = 'order-confirmed' | 'marketplace-order-confirmed';

/** Storefront orders get their own template; Hanukkah boxes and gift boxes get the box one. */
export function orderConfirmationTemplate(order: { orderType?: unknown }): OrderConfirmationTemplate {
  return order.orderType === 'marketplace' ? 'marketplace-order-confirmed' : 'order-confirmed';
}

export type OrderEmailLine = { name: string; quantity: number };

export function orderEmailLines(lineItems: unknown): OrderEmailLine[] {
  if (!Array.isArray(lineItems)) return [];
  return lineItems
    .filter((li): li is Record<string, unknown> => typeof li === 'object' && li !== null)
    .map((li) => ({
      name: String(li.label ?? li.itemId ?? 'Item'),
      quantity: Math.max(1, Math.floor(Number(li.quantity) || 1)),
    }));
}

export function orderItemSummary(lines: OrderEmailLine[]): string {
  return lines.map((li) => (li.quantity > 1 ? `${li.quantity}× ${li.name}` : li.name)).join(', ');
}

/** A send that crashed mid-flight releases its claim after this long. */
const EMAIL_CLAIM_STALE_MS = 10 * 60 * 1000;

/**
 * The checkout callable and the Stripe webhook can both finish the same order; only the caller
 * that wins `<prefix>ClaimedAt` sends. Clear the claim if the send fails.
 */
export async function claimOrderEmail(
  orderRef: DocumentReference,
  prefix: 'marketplaceEmail' | 'orderConfirmedEmail',
  now: number = Date.now()
): Promise<boolean> {
  return orderRef.firestore.runTransaction(async (tx) => {
    const data = (await tx.get(orderRef)).data() ?? {};
    if (data[`${prefix}SentAt`]) return false;
    const claimedAt = typeof data[`${prefix}ClaimedAt`] === 'string' ? Date.parse(data[`${prefix}ClaimedAt`]) : NaN;
    if (Number.isFinite(claimedAt) && now - claimedAt < EMAIL_CLAIM_STALE_MS) return false;
    tx.update(orderRef, { [`${prefix}ClaimedAt`]: new Date(now).toISOString() });
    return true;
  });
}
