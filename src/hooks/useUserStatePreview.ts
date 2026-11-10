import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { LAST_SIGNED_IN_KEY, useBoxPresenceStore } from '../stores/boxPresenceStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import {
  dateFromPreviewNowIso,
  useUserStatePreviewStore,
  type UserStatePreview,
} from '../stores/userStatePreviewStore';
import { useSession } from './useSession';
import { useBoxDraft } from './useBoxDraft';
import { familyOrderOpen } from '../constants/familyOrder';
import type { PilotOrder } from '../types/pilot';
import {
  PREVIEW_LOCKED_OPEN_ORDER,
  resolveBoxEditingLocked,
  resolveEffectiveBoxLocked,
  resolvePreviewCanMutateBox,
  resolvePreviewOpenOrder,
  shopHasBoxOrder,
} from '../services/storefront/resolveUserStatePreview';

export {
  PREVIEW_LOCKED_OPEN_ORDER,
  resolveBoxEditingLocked,
  resolveEffectiveBoxLocked,
  resolvePreviewCanMutateBox,
  resolvePreviewOpenOrder,
  shopHasBoxOrder,
};

function isSignedOutPreview(preview: UserStatePreview | null): boolean {
  return preview === 'signed_out' || preview === 'signed_out_box';
}

function isSignedInPreview(preview: UserStatePreview | null): boolean {
  return (
    preview === 'signed_in_no_box' ||
    preview === 'signed_in_box' ||
    preview === 'signed_in_needs_payment' ||
    preview === 'signed_in_locked'
  );
}

function previewHasBox(preview: UserStatePreview | null): boolean | null {
  if (!preview) return null;
  if (preview === 'signed_out' || preview === 'signed_in_no_box') return false;
  return true;
}

/** Effective signed-in flag for chrome / CTAs under an admin preview. */
export function usePreviewedIsAuthenticated(): boolean {
  const real = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const wasAuthenticated = useBoxPresenceStore((s) => s.wasAuthenticated);
  const preview = useUserStatePreviewStore((s) => s.preview);
  if (isSignedOutPreview(preview)) return false;
  if (isSignedInPreview(preview)) return true;
  // Cold load: keep signed-in chrome until Firebase finishes restoring the session.
  if (!real && authLoading && wasAuthenticated) return true;
  return real;
}

/** True once the household has a real Hanukkah box draft (not gift-only signup). */
export function usePreviewedHasStartedBox(): boolean {
  const preview = useUserStatePreviewStore((s) => s.preview);
  const overridden = previewHasBox(preview);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const householdId = useSession().household?.id ?? null;
  const guestHasBox = useGuestSessionStore(
    (s) => s.onboardingComplete || s.boxRevealComplete || s.lineItems.length > 0
  );
  const { lineItems, loading } = useBoxDraft();
  const remembered = useBoxPresenceStore((s) =>
    householdId ? s.byKey[householdId] : undefined
  );
  const lastSignedIn = useBoxPresenceStore((s) => s.byKey[LAST_SIGNED_IN_KEY]);

  if (overridden != null) return overridden;
  if (!isAuthenticated) {
    // Cold load: Firebase hasn't restored the session yet.
    if (authLoading && lastSignedIn !== undefined) return lastSignedIn;
    return guestHasBox;
  }
  // A new screen starts with an empty draft. Keep the last answer until this load finishes.
  if (loading) {
    const known = remembered ?? lastSignedIn;
    if (known !== undefined) return known;
  }
  return lineItems.length > 0;
}

export function useUserStatePreview(): UserStatePreview | null {
  return useUserStatePreviewStore((s) => s.preview);
}

/** Admin calendar override, or the real current time. */
export function usePreviewNow(): Date {
  const previewNowIso = useUserStatePreviewStore((s) => s.previewNowIso);
  return useMemo(() => dateFromPreviewNowIso(previewNowIso), [previewNowIso]);
}

export function useEffectiveBoxLocked(lockAt: string | null): boolean {
  const preview = useUserStatePreviewStore((s) => s.preview);
  const now = usePreviewNow();
  return resolveEffectiveBoxLocked(preview, lockAt, now, familyOrderOpen());
}

export function useBoxEditingLocked(
  lockAt: string | null,
  openOrder: { status?: string | null; lockAt?: string | null } | null | undefined
): boolean {
  const preview = useUserStatePreviewStore((s) => s.preview);
  const now = usePreviewNow();
  const seasonal = useEffectiveBoxLocked(lockAt);
  return resolveBoxEditingLocked(preview, seasonal, openOrder, now);
}

export function usePreviewedOpenOrder(realOpenOrder: PilotOrder | null): PilotOrder | null {
  const preview = useUserStatePreviewStore((s) => s.preview);
  return resolvePreviewOpenOrder(preview, realOpenOrder);
}
