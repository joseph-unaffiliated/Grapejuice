import { useMemo, useState, useEffect } from 'react';
import { useCatalog } from './useCatalog';
import { useCatalogInventory } from './useCatalogInventory';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';
import { usePreviewNow } from './useUserStatePreview';
import { useLiveBoxLocked } from './useLiveBoxLocked';
import {
  resolveAvailability,
  emptyInventoryCounters,
} from '../services/catalog/availability';
import type { CatalogAvailability, CatalogItem } from '../types/pilot';

/**
 * Resolve marketplace availability for every catalog item using live counters
 * and the holiday lock date (plus admin preview calendar day when set).
 * Same lockAt as live — personas do not fake an open or past lock.
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
  const [lockAt, setLockAt] = useState<string | null>(() => peekHanukkahConfig()?.lockAt ?? null);
  const [configLoading, setConfigLoading] = useState(() => peekHanukkahConfig() == null);
  const now = usePreviewNow();
  const locked = useLiveBoxLocked(lockAt);

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

  const byId = useMemo(() => {
    const map: Record<string, CatalogAvailability> = {};
    for (const item of items) {
      map[item.id] = resolveAvailability(
        item,
        counters[item.id] ?? emptyInventoryCounters(item.id),
        lockAt,
        now
      );
    }
    return map;
  }, [items, counters, lockAt, now]);

  return {
    byId,
    lockAt,
    locked,
    items,
    loading: catalogLoading || invLoading || configLoading,
  };
}
