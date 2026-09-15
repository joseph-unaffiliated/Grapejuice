import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { CatalogInventoryCounters } from '../../types/pilot';
import { CATALOG_HOLIDAY } from './catalog';

function inventoryCollection() {
  if (!db) return null;
  return collection(doc(db, 'catalog', CATALOG_HOLIDAY), 'inventory');
}

export function parseInventoryCounters(
  itemId: string,
  data: Record<string, unknown> | undefined
): CatalogInventoryCounters {
  const n = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  return {
    itemId,
    directReservedQty: n(data?.directReservedQty),
    directSoldQty: n(data?.directSoldQty),
    boxAllocatedQty: n(data?.boxAllocatedQty),
    boxAllocatedAt: typeof data?.boxAllocatedAt === 'string' ? data.boxAllocatedAt : null,
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
  };
}

export const catalogInventoryService = {
  subscribeAll(
    onData: (map: Record<string, CatalogInventoryCounters>) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const col = inventoryCollection();
    if (!col) {
      onData({});
      return () => undefined;
    }
    return onSnapshot(
      col,
      (snap) => {
        const map: Record<string, CatalogInventoryCounters> = {};
        for (const d of snap.docs) {
          map[d.id] = parseInventoryCounters(d.id, d.data() as Record<string, unknown>);
        }
        onData(map);
      },
      (err) => onError?.(err)
    );
  },
};
