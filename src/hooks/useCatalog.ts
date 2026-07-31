import { useEffect, useState } from 'react';
import { catalogService } from '../services/firestore/catalog';
import type { CatalogItem } from '../types/pilot';

/**
 * Live Firestore catalog (Airtable replace-sync writes here).
 * Empty array while the first snapshot is pending.
 */
export function useCatalog(): { items: CatalogItem[]; loading: boolean; error: string | null } {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = catalogService.subscribeAll(
      (next) => {
        setItems(next);
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

  return { items, loading, error };
}
