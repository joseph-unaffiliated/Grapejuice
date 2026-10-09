import { catalogService } from '../firestore/catalog';
import { catalogInventoryService } from '../firestore/catalogInventory';
import { getHanukkahConfig } from '../firestore/config';
import type { CatalogInventoryCounters, CatalogItem } from '../../types/pilot';

export type LiveState<T> = { value: T; loading: boolean; error: string | null };

type LiveStore<T> = {
  start: () => void;
  get: () => LiveState<T>;
  subscribe: (listener: () => void) => () => void;
};

/**
 * One app-wide Firestore listener per collection, kept open for the session so
 * screens that mount later (or remount after navigation) render from the last
 * snapshot instead of waiting on a fresh listen.
 */
function createLiveStore<T>(
  initial: T,
  listen: (onData: (value: T) => void, onError: (err: Error) => void) => () => void
): LiveStore<T> {
  let state: LiveState<T> = { value: initial, loading: true, error: null };
  let active = false;
  const listeners = new Set<() => void>();

  const emit = (next: LiveState<T>) => {
    state = next;
    listeners.forEach((l) => l());
  };

  const start = () => {
    if (active) return;
    active = true;
    listen(
      (value) => emit({ value, loading: false, error: null }),
      (err) => {
        // Firestore ends the listener on error; the next subscriber retries.
        active = false;
        emit({ ...state, loading: false, error: err.message });
      }
    );
  };

  return {
    start,
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const EMPTY_ITEMS: CatalogItem[] = [];
const EMPTY_COUNTERS: Record<string, CatalogInventoryCounters> = {};

export const liveCatalogItems = createLiveStore<CatalogItem[]>(EMPTY_ITEMS, (onData, onError) =>
  catalogService.subscribeAll(onData, onError)
);

export const liveCatalogInventory = createLiveStore<Record<string, CatalogInventoryCounters>>(
  EMPTY_COUNTERS,
  (onData, onError) => catalogInventoryService.subscribeAll(onData, onError)
);

/** Start catalog, inventory, and holiday config reads before any screen asks for them. */
export function prefetchStorefrontData(): void {
  liveCatalogItems.start();
  liveCatalogInventory.start();
  void getHanukkahConfig().catch(() => undefined);
}
