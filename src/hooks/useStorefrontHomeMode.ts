import {
  useEffectiveBoxLocked,
  usePreviewedHasStartedBox,
  usePreviewedIsAuthenticated,
  usePreviewNow,
  useUserStatePreview,
} from './useUserStatePreview';
import { usePaymentGate } from './usePaymentGate';
import { useBoxDraft } from './useBoxDraft';
import { getHanukkahStatus } from '../services/hanukkah/dates';
import { useGiftIntentStore } from '../stores/giftIntentStore';
import type { UserStatePreview } from '../stores/userStatePreviewStore';
import type { PilotOrder } from '../types/pilot';

/** Storefront home / chrome copy mode derived from preview or live session. */
export type StorefrontHomeMode =
  | 'acquisition'
  | 'guest_box'
  | 'customize'
  | 'needs_payment'
  | 'locked'
  | 'passover'
  /** Mid gift-credit flow — signed up / abandoned before pay. */
  | 'gift_credit_incomplete'
  /** Mid gift-customize flow — abandoned before pay. */
  | 'gift_customize_incomplete'
  /** Giver just paid; no household box yet. */
  | 'gift_sent';

export function resolveStorefrontHomeMode(args: {
  preview: UserStatePreview | null;
  isAuthenticated: boolean;
  hasStartedBox: boolean;
  /** True when draft actually has line items (not hollow gift signup). */
  hasBoxLineItems: boolean;
  locked: boolean;
  canMutateBox: boolean;
  /** When true (Hanukkah 2026 ended), seasonal chrome pivots to Passover. */
  afterHanukkah: boolean;
  giftStatus: 'idle' | 'incomplete' | 'sent';
  giftKind: 'credit_only' | 'customize' | null;
  openOrder: PilotOrder | null;
}): StorefrontHomeMode {
  const {
    preview,
    isAuthenticated,
    hasBoxLineItems,
    locked,
    canMutateBox,
    afterHanukkah,
    giftStatus,
    giftKind,
    openOrder,
  } = args;

  if (afterHanukkah) return 'passover';

  // Admin previews stay self-serve (gift modes are live-session only).
  if (preview === 'signed_out' || preview === 'signed_in_no_box') return 'acquisition';
  if (preview === 'signed_out_box') return 'guest_box';
  if (preview === 'signed_in_box') return 'customize';
  if (preview === 'signed_in_needs_payment') return 'needs_payment';
  if (preview === 'signed_in_locked') return 'locked';

  // Gift intent wins over false “started box” from mid-gift signup (boxRevealComplete).
  if (giftStatus === 'incomplete' && giftKind === 'credit_only') {
    return 'gift_credit_incomplete';
  }
  if (giftStatus === 'incomplete' && giftKind === 'customize') {
    return 'gift_customize_incomplete';
  }
  if (giftStatus === 'sent') {
    return 'gift_sent';
  }

  // Hollow account: reveal flagged for gift signup but no real box draft yet.
  if (!hasBoxLineItems) return 'acquisition';

  if (openOrder) {
    return locked ? 'locked' : 'customize';
  }

  if (locked) return 'locked';
  if (!isAuthenticated) return 'guest_box';
  if (!canMutateBox) return 'needs_payment';
  return 'customize';
}

/**
 * Home + services-nav mode from preview overlays, live auth/box/payment/lock,
 * gift intent, and calendar season (preview date or real now).
 */
export function useStorefrontHomeMode(
  lockAt: string | null,
  startsOn: string | null = null
): StorefrontHomeMode {
  const preview = useUserStatePreview();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasStartedBox = usePreviewedHasStartedBox();
  const { lineItems } = useBoxDraft();
  const locked = useEffectiveBoxLocked(lockAt);
  const { canMutateBox, openOrder } = usePaymentGate();
  const now = usePreviewNow();
  const afterHanukkah = getHanukkahStatus(startsOn, now).phase === 'after';
  const giftStatus = useGiftIntentStore((s) => s.status);
  const giftKind = useGiftIntentStore((s) => s.kind);

  return resolveStorefrontHomeMode({
    preview,
    isAuthenticated,
    hasStartedBox,
    hasBoxLineItems: lineItems.length > 0,
    locked,
    canMutateBox,
    afterHanukkah,
    giftStatus,
    giftKind,
    openOrder,
  });
}
