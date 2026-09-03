import { useCallback, useEffect, useState } from 'react';
import { ordersService } from '../services/firestore/orders';
import type { PilotOrder } from '../types/pilot';

/** Pre-ship order — household already committed a box for this pilot. */
export function isOpenPilotOrder(order: PilotOrder): boolean {
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

  const refresh = useCallback(async () => {
    if (!householdId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setOrders(await ordersService.listForHousehold(householdId));
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openOrder = orders.find(isOpenPilotOrder) ?? null;

  return { orders, openOrder, loading, refresh };
}
