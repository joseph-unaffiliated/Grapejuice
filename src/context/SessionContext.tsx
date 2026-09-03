import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { usersService } from '../services/firestore/users';
import { householdsService } from '../services/firestore/households';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { peekPendingAuthReturn } from '../services/auth/auth';
import type { Household, UserProfile } from '../types/pilot';

type SessionContextValue = {
  profile: UserProfile | null;
  household: Household | null;
  loading: boolean;
  error: string | null;
  isKid: boolean;
  needsOnboarding: boolean;
  needsBoxReveal: boolean;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const pendingGiftClaimToken = useAuthFlowStore((s) => s.pendingGiftClaimToken);
  const pendingGiftCustomize = useAuthFlowStore((s) => s.pendingGiftCustomize);
  const pendingGiftGive = useAuthFlowStore((s) => s.pendingGiftGive);
  const giftResume =
    pendingReturn === 'GiftGiverCustomize' ||
    pendingReturn === 'GiftGive' ||
    pendingReturn === 'GiftClaim' ||
    pendingGiftClaimToken != null ||
    pendingGiftCustomize != null ||
    pendingGiftGive != null;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    // Silent refreshes update session data without flipping the global boot
    // flag (avoids a full-screen spinner interrupting flows like onboarding).
    const stayOnSurface = Boolean(useAuthFlowStore.getState().pendingReturn);
    const silent = options?.silent ?? stayOnSurface;
    if (!user) {
      setProfile(null);
      setHousehold(null);
      // Always clear boot loading when signed out. Silent mode is for avoiding
      // spinner flicker while signed-in; leaving loading=true here hangs gift-claim
      // auth (pendingReturn set before a user exists).
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      let prof = await usersService.get(user.uid);
      const giftResumeNow =
        useAuthFlowStore.getState().pendingReturn === 'GiftGiverCustomize' ||
        useAuthFlowStore.getState().pendingReturn === 'GiftGive' ||
        useAuthFlowStore.getState().pendingReturn === 'GiftClaim' ||
        useAuthFlowStore.getState().pendingGiftClaimToken != null ||
        useAuthFlowStore.getState().pendingGiftCustomize != null ||
        useAuthFlowStore.getState().pendingGiftGive != null;
      // Nav sign in/up — past the onboarding gates without starting a box. The
      // sessionStorage fallback covers a Google redirect, which clears the store.
      const inPlaceAuthNow =
        (useAuthFlowStore.getState().pendingReturn ?? peekPendingAuthReturn()) === 'Stay';
      if (!prof) {
        const guest = useGuestSessionStore.getState();
        const guestHasOwnBox =
          !giftResumeNow &&
          (guest.boxRevealComplete ||
            guest.onboardingComplete ||
            guest.lineItems.length > 0);
        prof = await usersService.upsert(user.uid, {
          email: user.email,
          displayName: user.displayName,
          role: 'parent',
          onboardingComplete: guestHasOwnBox || giftResumeNow || inPlaceAuthNow,
          boxRevealComplete: guestHasOwnBox || inPlaceAuthNow,
        });
      } else if ((giftResumeNow || inPlaceAuthNow) && !prof.onboardingComplete) {
        // Gift resume and nav sign-up skip onboarding — never mark a household box as
        // started. boxRevealComplete stays true so RootNavigator doesn't dump into BoxReveal.
        prof = await usersService.upsert(user.uid, {
          onboardingComplete: true,
          boxRevealComplete: true,
        });
      }
      setProfile(prof);
      let hh: Household | null = null;
      if (prof.householdId) {
        hh = await householdsService.get(prof.householdId);
      }
      if (!hh && prof.role === 'parent') {
        hh = await householdsService.createForOwner(user.uid);
        prof = await usersService.upsert(user.uid, { householdId: hh.id });
        setProfile(prof);
      }
      setHousehold(hh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Session error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      await load(options);
    },
    [load]
  );

  const value: SessionContextValue = {
    profile,
    household,
    loading,
    error,
    isKid: profile?.role === 'child',
    // While resuming gift give/customize, never report needsOnboarding — RootRoutes
    // would remount Onboarding the instant pendingReturn is cleared.
    needsOnboarding:
      profile?.role === 'parent' && !profile?.onboardingComplete && !giftResume,
    needsBoxReveal:
      profile?.role === 'parent' &&
      !!profile?.onboardingComplete &&
      !profile?.boxRevealComplete &&
      !giftResume,
    refresh,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession requires SessionProvider');
  return ctx;
}
