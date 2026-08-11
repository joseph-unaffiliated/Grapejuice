import {
  useEffectiveBoxLocked,
  usePreviewedHasStartedBox,
  usePreviewedIsAuthenticated,
  usePreviewNow,
  useUserStatePreview,
} from './useUserStatePreview';
import { usePaymentGate } from './usePaymentGate';
import { getHanukkahStatus } from '../services/hanukkah/dates';
import type { UserStatePreview } from '../stores/userStatePreviewStore';

/** Storefront home / chrome copy mode derived from preview or live session. */
export type StorefrontHomeMode =
  | 'acquisition'
  | 'guest_box'
  | 'customize'
  | 'needs_payment'
  | 'locked'
  | 'passover';

export function resolveStorefrontHomeMode(args: {
  preview: UserStatePreview | null;
  isAuthenticated: boolean;
  hasStartedBox: boolean;
  locked: boolean;
  canMutateBox: boolean;
  /** When true (Hanukkah 2026 ended), seasonal chrome pivots to Passover. */
  afterHanukkah: boolean;
}): StorefrontHomeMode {
  const { preview, isAuthenticated, hasStartedBox, locked, canMutateBox, afterHanukkah } = args;

  if (afterHanukkah) return 'passover';

  if (preview === 'signed_out' || preview === 'signed_in_no_box') return 'acquisition';
  if (preview === 'signed_out_box') return 'guest_box';
  if (preview === 'signed_in_box') return 'customize';
  if (preview === 'signed_in_needs_payment') return 'needs_payment';
  if (preview === 'signed_in_locked') return 'locked';

  if (!hasStartedBox) return 'acquisition';
  if (locked) return 'locked';
  if (!isAuthenticated) return 'guest_box';
  if (!canMutateBox) return 'needs_payment';
  return 'customize';
}

/**
 * Home + services-nav mode from preview overlays, live auth/box/payment/lock,
 * and calendar season (preview date or real now).
 */
export function useStorefrontHomeMode(
  lockAt: string | null,
  startsOn: string | null = null
): StorefrontHomeMode {
  const preview = useUserStatePreview();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasStartedBox = usePreviewedHasStartedBox();
  const locked = useEffectiveBoxLocked(lockAt);
  const { canMutateBox } = usePaymentGate();
  const now = usePreviewNow();
  const afterHanukkah = getHanukkahStatus(startsOn, now).phase === 'after';

  return resolveStorefrontHomeMode({
    preview,
    isAuthenticated,
    hasStartedBox,
    locked,
    canMutateBox,
    afterHanukkah,
  });
}
