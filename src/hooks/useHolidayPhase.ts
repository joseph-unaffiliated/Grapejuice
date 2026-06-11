import { useMemo } from 'react';
import { getHanukkahStatus } from '../services/hanukkah/dates';
import type { PilotOrder } from '../types/pilot';
import type { HomePhase } from '../constants/pilotHolidays';

export function useHolidayPhase(
  startsOn: string | null,
  hasOrder: boolean,
  orders: PilotOrder[],
  now = new Date()
): { phase: HomePhase; hanukkah: ReturnType<typeof getHanukkahStatus>; primaryOrder: PilotOrder | null } {
  return useMemo(() => {
    const hanukkah = getHanukkahStatus(startsOn, now);
    const primaryOrder = orders.find((o) => o.status !== 'pending') ?? orders[0] ?? null;

    if (!hasOrder || !primaryOrder) {
      return { phase: 'pre-order', hanukkah, primaryOrder: null };
    }

    if (hanukkah.phase === 'during') {
      return { phase: 'during', hanukkah, primaryOrder };
    }

    if (hanukkah.phase === 'after') {
      return { phase: 'post', hanukkah, primaryOrder };
    }

    if (primaryOrder.status === 'delivered') {
      return { phase: 'delivered', hanukkah, primaryOrder };
    }

    if (primaryOrder.status === 'committed' || primaryOrder.status === 'confirmed' || primaryOrder.status === 'shipped') {
      return { phase: 'confirmed', hanukkah, primaryOrder };
    }

    return { phase: 'pre-order', hanukkah, primaryOrder };
  }, [startsOn, hasOrder, orders, now]);
}
