import type { UserStatePreview } from '../../stores/userStatePreviewStore';
import type { PilotOrder } from '../../types/pilot';

/** Storefront home / chrome copy mode derived from preview or live session. */
export type StorefrontHomeMode =
  | 'acquisition'
  | 'guest_box'
  | 'customize'
  | 'needs_payment'
  /** @deprecated Prefer `shop` after lock; kept for rare mid-migrate callers. */
  | 'locked'
  /** After box lock until Hanukkah ends — pure shop chrome. */
  | 'shop'
  | 'passover'
  /** Mid gift-credit flow — signed up / abandoned before pay. */
  | 'gift_credit_incomplete'
  /** Mid gift-customize flow — abandoned before pay. */
  | 'gift_customize_incomplete'
  /** Giver just paid; no household box yet. */
  | 'gift_sent';

export type StorefrontHomeModeArgs = {
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
};

/**
 * Map an admin user-state persona onto the same inputs the live path uses.
 * No hard-coded mode shortcuts — lock calendar / preview date still decide shop vs customize.
 */
export function homeModeArgsForPreview(
  preview: UserStatePreview | null,
  live: StorefrontHomeModeArgs
): StorefrontHomeModeArgs {
  if (!preview) return live;

  const baseGift = { giftStatus: 'idle' as const, giftKind: null };
  switch (preview) {
    case 'signed_out':
      return {
        ...live,
        ...baseGift,
        isAuthenticated: false,
        hasStartedBox: false,
        hasBoxLineItems: false,
        canMutateBox: false,
        openOrder: null,
      };
    case 'signed_out_box':
      return {
        ...live,
        ...baseGift,
        isAuthenticated: false,
        hasStartedBox: true,
        hasBoxLineItems: true,
        canMutateBox: false,
        openOrder: null,
      };
    case 'signed_in_no_box':
      return {
        ...live,
        ...baseGift,
        isAuthenticated: true,
        hasStartedBox: false,
        hasBoxLineItems: false,
        canMutateBox: true,
        openOrder: null,
      };
    case 'signed_in_box':
      return {
        ...live,
        ...baseGift,
        isAuthenticated: true,
        hasStartedBox: true,
        hasBoxLineItems: true,
        canMutateBox: true,
        openOrder: live.openOrder,
      };
    case 'signed_in_needs_payment':
      return {
        ...live,
        ...baseGift,
        isAuthenticated: true,
        hasStartedBox: true,
        hasBoxLineItems: true,
        canMutateBox: false,
        openOrder: null,
      };
    case 'signed_in_locked':
      return {
        ...live,
        ...baseGift,
        isAuthenticated: true,
        hasStartedBox: true,
        hasBoxLineItems: true,
        locked: true,
        canMutateBox: true,
        openOrder: live.openOrder,
      };
    default:
      return live;
  }
}

/** Pure home/chrome mode — same rules for Live and admin personas. */
export function resolveStorefrontHomeMode(args: StorefrontHomeModeArgs): StorefrontHomeMode {
  const {
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
  // After seasonal lock (family link keeps locked=false), cold shop — not a hollow customize.
  if (!hasBoxLineItems) return locked ? 'shop' : 'acquisition';

  if (openOrder) {
    return locked ? 'shop' : 'customize';
  }

  if (locked) return 'shop';
  if (!isAuthenticated) return 'guest_box';
  if (!canMutateBox) return 'needs_payment';
  return 'customize';
}
