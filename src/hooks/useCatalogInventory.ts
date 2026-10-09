import { useSyncExternalStore } from 'react';
import { liveCatalogInventory } from '../services/catalog/liveCatalog';
import type { CatalogInventoryCounters } from '../types/pilot';

/**
 * Live marketplace / box allocation counters under catalog/hanukkah/inventory.
 */
export function useCatalogInventory(): {
  byId: Record<string, CatalogInventoryCounters>;
  loading: boolean;
  error: string | null;
} {
  const state = useSyncExternalStore(liveCatalogInventory.subscribe, liveCatalogInventory.get);
  return { byId: state.value, loading: state.loading, error: state.error };
}
