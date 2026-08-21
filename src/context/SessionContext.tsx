import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { usersService } from '../services/firestore/users';
import { householdsService } from '../services/firestore/households';
import { useAuthFlowStore } from '../stores/authFlowStore';
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
  const pendingGiftCustomize = useAuthFlowStore((s) => s.pendingGiftCustomize);
  const giftResume =
    pendingReturn === 'GiftGiverCustomize' || pendingGiftCustomize != null;
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
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      let prof = await usersService.get(user.uid);
      const giftResumeNow =
        useAuthFlowStore.getState().pendingReturn === 'GiftGiverCustomize' ||
        useAuthFlowStore.getState().pendingGiftCustomize != null;
      if (!prof) {
        const guest = useGuestSessionStore.getState();
        const guestHasBox =
          giftResumeNow ||
          guest.boxRevealComplete ||
          guest.onboardingComplete ||
          guest.lineItems.length > 0;
        prof = await usersService.upsert(user.uid, {
          email: user.email,
          displayName: user.displayName,
          role: 'parent',
          onboardingComplete: guestHasBox,
          boxRevealComplete: guestHasBox,
        });
      } else if (giftResumeNow && (!prof.onboardingComplete || !prof.boxRevealComplete)) {
        // Heal stale stub profiles written before gift-resume flags landed.
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
    // While resuming gift customize, never report needsOnboarding — RootRoutes
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
