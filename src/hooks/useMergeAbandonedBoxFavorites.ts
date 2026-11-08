import { useEffect, useRef } from 'react';
import { draftsRetired } from '../constants/hanukkahBoxLock';
import { useBoxDraft } from './useBoxDraft';
import { useSession } from './useSession';
import { useWishlist } from './useWishlist';
import { usePreviewedIsAuthenticated, usePreviewNow } from './useUserStatePreview';
import { householdsService } from '../services/firestore/households';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import type { StorefrontHomeMode } from './useStorefrontHomeMode';

const MERGED_KEY = 'gj.abandonedBoxFavoritesMerged';

function alreadyMerged(key: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(MERGED_KEY) === key;
  } catch {
    return false;
  }
}

function markMerged(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MERGED_KEY, key);
  } catch {
    /* private mode */
  }
}

/**
 * First shop visit after Monday noon ET: union unfinished draft line item IDs
 * into favorites. Does not clear the draft or history — wishlist only.
 *
 * Shop mode also turns on between the Saturday lock and the Sunday 6am reopen.
 * This hook stays idle through that window so those drafts come back intact.
 * A friends-and-family link never enters shop mode, so that box is left alone.
 */
export function useMergeAbandonedBoxFavorites(mode: StorefrontHomeMode): void {
  const now = usePreviewNow();
  const { lineItems } = useBoxDraft();
  const { household, refresh } = useSession();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { ids: wishlistIds } = useWishlist();
  const addGuestWishlist = useGuestSessionStore((s) => s.addWishlistItems);
  const ran = useRef(false);

  useEffect(() => {
    if (mode !== 'shop' || !draftsRetired(now) || ran.current) return;
    const ids = [
      ...new Set(lineItems.map((li) => li.itemId).filter((id): id is string => !!id)),
    ];
    if (!ids.length) return;

    const scope = isAuthenticated && household?.id ? `hh:${household.id}` : 'guest';
    const key = `${scope}|${ids.slice().sort().join(',')}`;
    if (alreadyMerged(key)) {
      ran.current = true;
      return;
    }

    ran.current = true;
    void (async () => {
      if (isAuthenticated && household?.id) {
        const existing = household.wishlistItemIds ?? wishlistIds ?? [];
        const next = [...new Set([...existing, ...ids])];
        if (next.length === existing.length) {
          markMerged(key);
          return;
        }
        await householdsService.setWishlistItemIds(household.id, next);
        await refresh({ silent: true });
        markMerged(key);
        return;
      }
      addGuestWishlist(ids);
      markMerged(key);
    })();
  }, [
    mode,
    now,
    lineItems,
    isAuthenticated,
    household?.id,
    household?.wishlistItemIds,
    wishlistIds,
    addGuestWishlist,
    refresh,
  ]);
}
