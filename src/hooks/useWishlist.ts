import { useCallback, useMemo, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useSession } from './useSession';
import { householdsService } from '../services/firestore/households';

export function useWishlist() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household, refresh } = useSession();
  const guestIds = useGuestSessionStore((s) => s.wishlistItemIds);
  const toggleGuest = useGuestSessionStore((s) => s.toggleWishlistItem);
  const [saving, setSaving] = useState(false);

  const ids = useMemo(() => {
    if (isAuthenticated && household) {
      return household.wishlistItemIds ?? [];
    }
    return guestIds;
  }, [isAuthenticated, household, guestIds]);

  const isWishlisted = useCallback((itemId: string) => ids.includes(itemId), [ids]);

  const toggleWishlist = useCallback(
    async (itemId: string) => {
      if (!isAuthenticated || !household?.id) {
        toggleGuest(itemId);
        return;
      }
      setSaving(true);
      try {
        const next = ids.includes(itemId)
          ? ids.filter((id) => id !== itemId)
          : [...ids, itemId];
        await householdsService.setWishlistItemIds(household.id, next);
        await refresh({ silent: true });
      } finally {
        setSaving(false);
      }
    },
    [isAuthenticated, household?.id, ids, toggleGuest, refresh]
  );

  return { ids, isWishlisted, toggleWishlist, saving };
}
