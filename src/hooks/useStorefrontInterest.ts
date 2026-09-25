import { useCallback } from 'react';
import { PASSOVER_NOTIFY_INTEREST } from '../constants/pilotHolidays';
import { useSession } from './useSession';
import { usersService } from '../services/firestore/users';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';

/**
 * Idempotent storefront interest mark (Passover pre-reg, B'Mitzvah pilot, etc.).
 * Guests → guestSessionStore.interests; signed-in → users.storefrontInterests
 * (and notificationsOptIn for Passover).
 */
export function useStorefrontInterest(key: string): {
  marked: boolean;
  mark: () => void;
} {
  const guestInterests = useGuestSessionStore((s) => s.interests);
  const toggleGuestInterest = useGuestSessionStore((s) => s.toggleInterest);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { profile, refresh } = useSession();

  const profileInterests = profile?.storefrontInterests ?? [];
  const marked =
    guestInterests.includes(key) || profileInterests.includes(key);

  const mark = useCallback(() => {
    if (marked) return;

    if (!guestInterests.includes(key)) {
      toggleGuestInterest(key);
    }

    if (isAuthenticated && user?.uid) {
      const next = profileInterests.includes(key)
        ? profileInterests
        : [...profileInterests, key];
      void usersService
        .upsert(user.uid, {
          storefrontInterests: next,
          ...(key === PASSOVER_NOTIFY_INTEREST
            ? { notificationsOptIn: true }
            : null),
        })
        .then(() => refresh({ silent: true }))
        .catch(() => undefined);
    }
  }, [
    marked,
    guestInterests,
    key,
    toggleGuestInterest,
    isAuthenticated,
    user?.uid,
    profileInterests,
    refresh,
  ]);

  return { marked, mark };
}
