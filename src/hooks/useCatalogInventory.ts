import { useEffect, useState } from 'react';
import { catalogInventoryService } from '../services/firestore/catalogInventory';
import type { CatalogInventoryCounters } from '../types/pilot';

/**
 * Live marketplace / box allocation counters under catalog/hanukkah/inventory.
 */
export function useCatalogInventory(): {
  byId: Record<string, CatalogInventoryCounters>;
  loading: boolean;
  error: string | null;
} {
  const [byId, setById] = useState<Record<string, CatalogInventoryCounters>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = catalogInventoryService.subscribeAll(
      (next) => {
        setById(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  return { byId, loading, error };
}
