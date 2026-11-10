import { useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  useBoxEditingLocked,
  usePreviewedHasStartedBox,
  usePreviewedIsAuthenticated,
  usePreviewNow,
  useUserStatePreview,
} from './useUserStatePreview';
import { usePaymentGate } from './usePaymentGate';
import { useBoxDraft } from './useBoxDraft';
import { useSession } from './useSession';
import { getHanukkahStatus } from '../services/hanukkah/dates';
import { useGiftIntentStore } from '../stores/giftIntentStore';
import {
  homeModeArgsForPreview,
  resolveStorefrontHomeMode,
  type StorefrontHomeMode,
  type StorefrontHomeModeArgs,
} from '../services/storefront/resolveHomeMode';

export type { StorefrontHomeMode, StorefrontHomeModeArgs };
export { homeModeArgsForPreview, resolveStorefrontHomeMode };

/**
 * Home + services-nav mode from preview overlays, live auth/box/payment/lock,
 * gift intent, and calendar season (preview date or real now).
 *
 * Admin personas feed the same resolver as Live — they do not hard-code chrome.
 * Pin a pre-lock preview day to see customize / needs-payment after the real lock.
 *
 * While auth / session / box draft / orders are still settling, holds the last
 * resolved mode so chrome doesn’t flash acquisition → member (or the reverse).
 *
 * Family-order link browsers keep `locked === false` via useEffectiveBoxLocked,
 * so they never enter `shop` and retain pre-lock box build/checkout.
 */
export function useStorefrontHomeMode(
  lockAt: string | null,
  startsOn: string | null = null,
  /** Resolve the household box state as if no gift flow were in progress. */
  options: { ignoreGiftIntent?: boolean } = {}
): StorefrontHomeMode {
  const preview = useUserStatePreview();
  const authLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasStartedBox = usePreviewedHasStartedBox();
  const { loading: sessionLoading } = useSession();
  const { lineItems, loading: boxLoading } = useBoxDraft();
  const { canMutateBox, openOrder } = usePaymentGate();
  const locked = useBoxEditingLocked(lockAt, openOrder);
  const now = usePreviewNow();
  const afterHanukkah = getHanukkahStatus(startsOn, now).phase === 'after';
  const giftStatus = useGiftIntentStore((s) => s.status);
  const giftKind = useGiftIntentStore((s) => s.kind);

  const settling =
    !preview &&
    (authLoading || (isAuthenticated && (sessionLoading || boxLoading)));

  const liveArgs: StorefrontHomeModeArgs = {
    isAuthenticated,
    hasStartedBox,
    hasBoxLineItems: lineItems.length > 0,
    locked,
    canMutateBox,
    afterHanukkah,
    giftStatus: options.ignoreGiftIntent ? 'idle' : giftStatus,
    giftKind: options.ignoreGiftIntent ? null : giftKind,
    openOrder,
  };

  const resolved = resolveStorefrontHomeMode(homeModeArgsForPreview(preview, liveArgs));

  const stableRef = useRef<StorefrontHomeMode | null>(null);
  if (!settling) {
    stableRef.current = resolved;
    return resolved;
  }

  // Keep the last known mode while auth/session/box draft catch up (avoids
  // acquisition → member flashes). First paint should be covered by RootRoutes boot.
  return stableRef.current ?? resolved;
}
