import { useCallback } from 'react';
import { PASSOVER_NOTIFY_INTEREST } from '../constants/pilotHolidays';
import { useSession } from './useSession';
import { usersService } from '../services/firestore/users';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';

/**
 * Toggleable storefront interest (Passover pre-reg, B'Mitzvah pilot, holiday waitlists).
 * Guests → guestSessionStore.interests; signed-in → users.storefrontInterests
 * (and notificationsOptIn when marking Passover).
 */
export function useStorefrontInterest(key: string): {
  marked: boolean;
  /** Add or remove this interest (guest + Firestore when signed in). */
  toggle: () => void;
  /** @deprecated Prefer `toggle` — same behavior. */
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

  const toggle = useCallback(() => {
    const nextMarked = !marked;

    // Keep guest list in sync (toggleInterest flips membership).
    if (guestInterests.includes(key) !== nextMarked) {
      toggleGuestInterest(key);
    }

    if (isAuthenticated && user?.uid) {
      const next = nextMarked
        ? profileInterests.includes(key)
          ? profileInterests
          : [...profileInterests, key]
        : profileInterests.filter((i) => i !== key);

      void usersService
        .upsert(user.uid, {
          storefrontInterests: next,
          ...(nextMarked && key === PASSOVER_NOTIFY_INTEREST
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

  return { marked, toggle, mark: toggle };
}
