import { useSyncExternalStore } from 'react';
import { liveCatalogItems } from '../services/catalog/liveCatalog';
import type { CatalogItem } from '../types/pilot';

/**
 * Live Firestore catalog (Airtable replace-sync writes here).
 * Empty array while the first snapshot is pending; later mounts reuse the
 * shared snapshot without waiting.
 */
export function useCatalog(): { items: CatalogItem[]; loading: boolean; error: string | null } {
  const state = useSyncExternalStore(liveCatalogItems.subscribe, liveCatalogItems.get);
  return { items: state.value, loading: state.loading, error: state.error };
}
