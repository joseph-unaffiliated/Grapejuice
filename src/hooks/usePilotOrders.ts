import { useCallback, useEffect, useState } from 'react';
import { ordersService } from '../services/firestore/orders';
import type { PilotOrder } from '../types/pilot';

/** Pre-ship **Hanukkah box** order — household already committed a box for this pilot.
 * Marketplace / received-gift orders must not count (they were hijacking box checkout). */
export function isOpenPilotOrder(order: PilotOrder): boolean {
  if (order.orderType === 'marketplace' || order.orderType === 'received_gift') return false;
  return (
    order.status === 'committed' ||
    order.status === 'pending' ||
    order.status === 'confirmed' ||
    order.status === 'shipped'
  );
}

export function usePilotOrders(householdId: string | undefined) {
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [loading, setLoading] = useState(true);
  /** Household the current `orders` belong to — until it matches, we're still loading. */
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!householdId) {
      setOrders([]);
      setLoading(false);
      setLoadedFor(null);
      return;
    }
    setLoading(true);
    try {
      setOrders(await ordersService.listForHousehold(householdId));
    } finally {
      setLoading(false);
      setLoadedFor(householdId);
    }
  }, [householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openOrder = orders.find(isOpenPilotOrder) ?? null;
  // The render where the household first appears precedes the fetch effect.
  const stale = loadedFor !== (householdId ?? null);

  return { orders, openOrder, loading: loading || stale, refresh };
}
