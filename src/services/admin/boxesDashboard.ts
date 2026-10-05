import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

/** Mirrors functions/src/adminDashboard.ts — keep in sync. */
export type DashLine = {
  itemId: string | null;
  name: string;
  qty: number;
  unitCents: number;
  addOn: boolean;
  child: string | null;
  forHousehold: boolean;
};

export type DashBox = {
  id: string;
  source: 'order' | 'draft';
  orderId: string | null;
  householdId: string;
  customer: string | null;
  email: string | null;
  test: boolean;
  kids: number;
  status: string;
  playthrough: boolean;
  cardOnFile: boolean;
  boxPriceCents: number;
  addOnCents: number;
  subtotalCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  creditCents: number;
  totalCents: number | null;
  updatedAt: string | null;
  committedAt: string | null;
  attribution: string | null;
  lines: DashLine[];
};

export type DashGift = {
  id: string;
  giver: string | null;
  giverEmail: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  kind: 'box' | 'credit';
  amountCents: number | null;
  paid: boolean;
  paymentStatus: string | null;
  status: string;
  claimed: boolean;
  checkedOut: boolean;
  checkoutOrders: Array<{ id: string; status: string; totalCents: number | null; createdAt: string | null; playthrough: boolean }>;
  holdingStock: boolean;
  playthrough: boolean;
  test: boolean;
  message: string | null;
  createdAt: string | null;
  lines: DashLine[];
};

export type DashInventoryRow = {
  id: string;
  name: string;
  stock: number | null;
  heldByBoxes: number;
  heldByGifts: number;
  counterAllocated: number;
  directSold: number;
  directReserved: number;
  remaining: number | null;
  favorites: number;
  favoritesReal: number;
};

export type BoxesDashboard = {
  generatedAt: string;
  lockAt: string | null;
  counts: { households: number; drafts: number; orders: number; giftInvites: number; catalogItems: number };
  mismatches: Array<{ id: string; name: string; computed: number; counter: number }>;
  boxes: DashBox[];
  gifts: DashGift[];
  inventory: DashInventoryRow[];
};

export const DASHBOARD_REFRESH_MS = 60_000;

function pageVisible(): boolean {
  if (Platform.OS === 'web' && typeof document !== 'undefined') return document.visibilityState === 'visible';
  return AppState.currentState === 'active';
}

/** Fetches the admin dashboard, then re-fetches every minute while the page is visible. */
export function useBoxesDashboard(enabled: boolean) {
  const [data, setData] = useState<BoxesDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const fn = httpsCallable<void, BoxesDashboard>(functions, 'getAdminBoxesDashboard');
      const res = await fn();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => {
      if (pageVisible()) void refresh();
    }, DASHBOARD_REFRESH_MS);
    const onVisible = () => {
      if (pageVisible()) void refresh();
    };
    const sub = AppState.addEventListener('change', onVisible);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(timer);
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [enabled, refresh]);

  return { data, error, refreshing, refresh };
}
