import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import {
  dateFromPreviewNowIso,
  useUserStatePreviewStore,
  type UserStatePreview,
} from '../stores/userStatePreviewStore';
import { useSession } from './useSession';
import { isBoxLocked } from '../services/firestore/config';

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
  const preview = useUserStatePreviewStore((s) => s.preview);
  if (isSignedOutPreview(preview)) return false;
  if (isSignedInPreview(preview)) return true;
  return real;
}

/** True once the household has completed (or revealed) a Hanukkah box build. */
export function usePreviewedHasStartedBox(): boolean {
  const preview = useUserStatePreviewStore((s) => s.preview);
  const overridden = previewHasBox(preview);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { profile } = useSession();
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);

  if (overridden != null) return overridden;

  if (isAuthenticated) {
    // Reveal means a box was built — onboardingComplete alone is also set when
    // someone chooses “explore without building a box.”
    return !!profile?.boxRevealComplete;
  }
  return guestOnboardingComplete || guestRevealComplete;
}

export function useUserStatePreview(): UserStatePreview | null {
  return useUserStatePreviewStore((s) => s.preview);
}

/** Admin calendar override, or the real current time. */
export function usePreviewNow(): Date {
  const previewNowIso = useUserStatePreviewStore((s) => s.previewNowIso);
  return useMemo(() => dateFromPreviewNowIso(previewNowIso), [previewNowIso]);
}

/**
 * Box customization lock under preview. Locked / unlocked states are forced
 * so QA isn't dependent on the real Hanukkah lock clock. Live mode respects
 * an admin preview “now” when comparing to lockAt.
 */
export function useEffectiveBoxLocked(lockAt: string | null): boolean {
  const preview = useUserStatePreviewStore((s) => s.preview);
  const now = usePreviewNow();
  if (preview === 'signed_in_locked') return true;
  if (
    preview === 'signed_in_box' ||
    preview === 'signed_in_needs_payment' ||
    preview === 'signed_in_no_box' ||
    preview === 'signed_out' ||
    preview === 'signed_out_box'
  ) {
    return false;
  }
  return isBoxLocked(lockAt, now);
}

/** Payment-gate override: null = use real household; boolean = force. */
export function resolvePreviewCanMutateBox(
  preview: UserStatePreview | null,
  realCanMutate: boolean
): boolean {
  if (preview === 'signed_in_needs_payment') return false;
  if (
    preview === 'signed_in_box' ||
    preview === 'signed_in_locked' ||
    preview === 'signed_in_no_box'
  ) {
    return true;
  }
  if (isSignedOutPreview(preview)) return false;
  return realCanMutate;
}
