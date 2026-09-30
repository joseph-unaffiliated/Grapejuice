import { useCallback } from 'react';
import { PASSOVER_NOTIFY_INTEREST } from '../constants/pilotHolidays';
import { useSession } from './useSession';
import { usersService } from '../services/firestore/users';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { trackPreRegister } from '../services/analytics/metaServerEvents';

/** Write one storefront interest onto the signed-in user's profile. */
export async function applyStorefrontInterest(
  uid: string,
  current: string[],
  key: string,
  marked: boolean
): Promise<void> {
  const next = marked
    ? current.includes(key)
      ? current
      : [...current, key]
    : current.filter((i) => i !== key);
  await usersService.upsert(uid, {
    storefrontInterests: next,
    ...(marked && key === PASSOVER_NOTIFY_INTEREST ? { notificationsOptIn: true } : null),
  });
  if (marked && !current.includes(key)) trackPreRegister(key);
}

/**
 * Toggleable storefront interest (Passover pre-reg, B'Mitzvah pilot, holiday waitlists).
 * Signed-in only → users.storefrontInterests (and notificationsOptIn when marking
 * Passover). Guests are sent to sign in; the interest is applied after auth
 * (`PendingInterestEffect`).
 */
export function useStorefrontInterest(key: string): {
  marked: boolean;
  /** Add or remove this interest (prompts sign-in for guests). */
  toggle: () => void;
  /** @deprecated Prefer `toggle` — same behavior. */
  mark: () => void;
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { profile, refresh } = useSession();

  const profileInterests = profile?.storefrontInterests ?? [];
  const marked = isAuthenticated && profileInterests.includes(key);

  const toggle = useCallback(() => {
    if (!isAuthenticated || !user?.uid) {
      const flow = useAuthFlowStore.getState();
      flow.setPendingInterestKey(key);
      flow.startAuthInPlace('signin');
      return;
    }
    void applyStorefrontInterest(user.uid, profileInterests, key, !marked)
      .then(() => refresh({ silent: true }))
      .catch(() => undefined);
  }, [marked, key, isAuthenticated, user?.uid, profileInterests, refresh]);

  return { marked, toggle, mark: toggle };
}
