import { useMemo, useState, useEffect } from 'react';
import { useCatalog } from './useCatalog';
import { useCatalogInventory } from './useCatalogInventory';
import { getHanukkahConfig } from '../services/firestore/config';
import { useEffectiveBoxLocked, usePreviewNow, useUserStatePreview } from './useUserStatePreview';
import {
  resolveAvailability,
  emptyInventoryCounters,
} from '../services/catalog/availability';
import type { CatalogAvailability, CatalogItem } from '../types/pilot';

/**
 * Resolve marketplace availability for every catalog item using live counters
 * and the holiday lock date (respects admin preview lock / unlocked / now).
 */
export function useCatalogAvailabilityMap(): {
  byId: Record<string, CatalogAvailability>;
  lockAt: string | null;
  locked: boolean;
  items: CatalogItem[];
  loading: boolean;
} {
  const { items, loading: catalogLoading } = useCatalog();
  const { byId: counters, loading: invLoading } = useCatalogInventory();
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const now = usePreviewNow();
  const preview = useUserStatePreview();
  const locked = useEffectiveBoxLocked(lockAt);

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setLockAt(config.lockAt);
      setConfigLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Map preview lock override onto a lockAt the pure resolver understands. */
  const effectiveLockAt = useMemo(() => {
    if (preview === 'signed_in_locked') return '2000-01-01T00:00:00.000Z';
    if (
      preview === 'signed_in_box' ||
      preview === 'signed_in_needs_payment' ||
      preview === 'signed_in_no_box' ||
      preview === 'signed_out' ||
      preview === 'signed_out_box'
    ) {
      return null;
    }
    return lockAt;
  }, [preview, lockAt]);

  const byId = useMemo(() => {
    const map: Record<string, CatalogAvailability> = {};
    for (const item of items) {
      map[item.id] = resolveAvailability(
        item,
        counters[item.id] ?? emptyInventoryCounters(item.id),
        effectiveLockAt,
        now
      );
    }
    return map;
  }, [items, counters, effectiveLockAt, now]);

  return {
    byId,
    lockAt,
    locked,
    items,
    loading: catalogLoading || invLoading || configLoading,
  };
}
