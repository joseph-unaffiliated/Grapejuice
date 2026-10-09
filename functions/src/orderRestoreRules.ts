/**
 * When a cancelled Hanukkah box can be put back the way it was (see restorePilotBoxOrder).
 * Pure so it can be unit tested without Firestore.
 */

export type RestoreBlockCode =
  | 'not_box_order'
  | 'not_cancelled'
  | 'system_cancelled'
  | 'empty_box'
  | 'locked'
  | 'other_active_box';

/** Restorable in principle, but only through a fresh checkout (card, address or credit changed). */
export type RestoreCheckoutReason = 'no_address' | 'no_card' | 'credit_changed';

export type RestoreVerdict =
  | { ok: true }
  | { ok: false; code: RestoreBlockCode; message: string }
  | { ok: false; code: 'needs_checkout'; reason: RestoreCheckoutReason; message: string };

export type RestoreOrderFacts = {
  status?: unknown;
  cancelReason?: unknown;
  lineItems?: unknown;
  shippingAddress?: unknown;
  totalCents?: unknown;
  giftCreditAppliedCents?: unknown;
  platformCreditAppliedCents?: unknown;
};

export type RestoreHouseholdFacts = {
  giftCreditCents?: unknown;
  platformCreditCents?: unknown;
  stripeDefaultPaymentMethodId?: unknown;
};

function cents(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

function filled(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function hasCompleteShippingAddress(address: unknown): boolean {
  if (!address || typeof address !== 'object') return false;
  const a = address as Record<string, unknown>;
  return filled(a.line1) && filled(a.city) && filled(a.stateProvince) && filled(a.postalCode);
}

export function restoreEligibility(input: {
  order: RestoreOrderFacts;
  isBoxOrder: boolean;
  household: RestoreHouseholdFacts;
  lockAt: string | null;
  otherActiveBox: boolean;
  nowMs?: number;
}): RestoreVerdict {
  const { order, household } = input;
  const nowMs = input.nowMs ?? Date.now();

  if (!input.isBoxOrder) {
    return { ok: false, code: 'not_box_order', message: 'Only Hanukkah box orders can be restored.' };
  }
  if (order.status !== 'cancelled') {
    return { ok: false, code: 'not_cancelled', message: 'This order isn’t cancelled.' };
  }
  if (order.cancelReason != null) {
    return {
      ok: false,
      code: 'system_cancelled',
      message: 'This order can’t be restored in the app. Contact support for help.',
    };
  }
  if (!Array.isArray(order.lineItems) || order.lineItems.length === 0) {
    return { ok: false, code: 'empty_box', message: 'This box has no items to restore.' };
  }
  if (input.lockAt && nowMs >= new Date(input.lockAt).getTime()) {
    return {
      ok: false,
      code: 'locked',
      message: 'Boxes have locked for this Hanukkah, so this box can’t be restored. Contact support for help.',
    };
  }
  if (input.otherActiveBox) {
    return {
      ok: false,
      code: 'other_active_box',
      message: 'You already have an active Hanukkah box. You can find it in My Box.',
    };
  }
  if (!hasCompleteShippingAddress(order.shippingAddress)) {
    return {
      ok: false,
      code: 'needs_checkout',
      reason: 'no_address',
      message: 'This order no longer has a shipping address. Check out again to restore your box.',
    };
  }
  const giftApplied = cents(order.giftCreditAppliedCents);
  const platformApplied = cents(order.platformCreditAppliedCents);
  if (giftApplied > cents(household.giftCreditCents) || platformApplied > cents(household.platformCreditCents)) {
    return {
      ok: false,
      code: 'needs_checkout',
      reason: 'credit_changed',
      message: 'Credit from this order has since been used. Check out again to restore your box.',
    };
  }
  if (cents(order.totalCents) > 0 && !filled(household.stripeDefaultPaymentMethodId)) {
    return {
      ok: false,
      code: 'needs_checkout',
      reason: 'no_card',
      message: 'Your saved card is no longer on file. Check out again to restore your box.',
    };
  }
  return { ok: true };
}
