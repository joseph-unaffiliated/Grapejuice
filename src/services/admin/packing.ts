import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

/** Mirrors functions/src/adminPacking.ts — keep in sync. */
export type PackingKind = 'box' | 'shop' | 'gift';
export type PackingSize = '14x14x6' | '14x14x12' | '10x8x6';

export const PACKING_SIZE_LABEL: Record<PackingSize, string> = {
  '14x14x6': '14 × 14 × 6 in',
  '14x14x12': '14 × 14 × 12 in',
  '10x8x6': '10 × 8 × 6 in',
};

export type PackingAddress = {
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string | null;
};

export type PackingLine = {
  key: string;
  itemId: string | null;
  name: string;
  qty: number;
  child: string | null;
  forHousehold: boolean;
  origin: 'default' | 'changed' | 'added' | null;
  wrap: boolean;
  dimensions: string | null;
  maxInches: number | null;
  packed: boolean;
};

export type PackingPackage = {
  id: string;
  kind: PackingKind;
  status: string;
  reference: string;
  recipient: string | null;
  email: string | null;
  test: boolean;
  paidAt: string | null;
  destination: PackingAddress | null;
  kids: Array<{ name: string | null; age: string | null }>;
  sliders: { hanukkah: number | null; jewish: number | null };
  note: string | null;
  recommendedSize: PackingSize;
  /** Flag only: an item is over 12 in or the package holds a lot of units. */
  mayNeedLargeBox: boolean;
  size: PackingSize;
  sizeSet: boolean;
  /** Committed box whose card has not been charged yet. Hidden unless Simulate Post-Lock is on. */
  awaitingPayment: boolean;
  lines: PackingLine[];
};

export type AdminPackingList = {
  generatedAt: string;
  packages: PackingPackage[];
};

export async function fetchAdminPacking(): Promise<AdminPackingList> {
  const fn = httpsCallable<Record<string, never>, AdminPackingList>(functions, 'getAdminPacking', { timeout: 320_000 });
  const res = await fn({});
  return res.data;
}

export async function setPackingLinePacked(packageId: string, lineKey: string, packed: boolean): Promise<void> {
  const fn = httpsCallable<{ packageId: string; lineKey: string; packed: boolean }, { ok: true }>(
    functions,
    'setAdminPackingState',
  );
  await fn({ packageId, lineKey, packed });
}

export async function setPackingSize(packageId: string, size: PackingSize): Promise<void> {
  const fn = httpsCallable<{ packageId: string; size: PackingSize }, { ok: true }>(functions, 'setAdminPackingState');
  await fn({ packageId, size });
}

/** Loads the packing list once when `enabled`, and again on demand. */
export function useAdminPacking(enabled: boolean) {
  const [data, setData] = useState<AdminPackingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setData(await fetchAdminPacking());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load packing list');
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { data, setData, error, refreshing, refresh };
}
