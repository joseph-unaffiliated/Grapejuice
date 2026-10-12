import { useCallback, useEffect, useState } from 'react';
import { ordersService } from '../services/firestore/orders';
import type { PilotOrder } from '../types/pilot';

/** Last orders list per household, so Checkout doesn't open on a spinner after My Box already loaded them. */
const ordersMemory = new Map<string, PilotOrder[]>();

export function peekHouseholdOrders(householdId: string | undefined): PilotOrder[] | null {
  if (!householdId || !ordersMemory.has(householdId)) return null;
  return ordersMemory.get(householdId) ?? null;
}

function rememberHouseholdOrders(householdId: string, orders: PilotOrder[]) {
  ordersMemory.set(householdId, orders);
}

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
  const [orders, setOrders] = useState<PilotOrder[]>(() => peekHouseholdOrders(householdId) ?? []);
  const [loading, setLoading] = useState(() => peekHouseholdOrders(householdId) == null && !!householdId);
  /** Household the current `orders` belong to — until it matches, we're still loading. */
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(() => {
    if (!householdId) return undefined;
    return peekHouseholdOrders(householdId) ? householdId : undefined;
  });

  const refresh = useCallback(async () => {
    if (!householdId) {
      setOrders([]);
      setLoading(false);
      setLoadedFor(null);
      return;
    }
    if (peekHouseholdOrders(householdId) == null) setLoading(true);
    try {
      const next = await ordersService.listForHousehold(householdId);
      rememberHouseholdOrders(householdId, next);
      setOrders(next);
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
