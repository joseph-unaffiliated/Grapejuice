import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { listMyReceivedGifts } from '../services/gift/giftFlow';
import {
  mergeReceivedGifts,
  receivedGiftsService,
} from '../services/firestore/receivedGifts';
import type { ReceivedGift } from '../types/pilot';

export function useReceivedGifts() {
  const user = useAuthStore((s) => s.user);
  const { household, loading: sessionLoading } = useSession();
  const [gifts, setGifts] = useState<ReceivedGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionLoading) return;
    if (!user?.uid) {
      setGifts([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (!household?.id) {
      setGifts([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const errors: string[] = [];

    let fromFirestore: ReceivedGift[] = [];
    try {
      fromFirestore = await receivedGiftsService.listForHousehold(household.id);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Could not load gifts from account');
    }

    let fromCallable: ReceivedGift[] = [];
    try {
      fromCallable = await listMyReceivedGifts();
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Could not load gifts');
    }

    const merged = mergeReceivedGifts(fromFirestore, fromCallable);
    setGifts(merged);
    setError(merged.length === 0 && errors.length ? errors.join(' · ') : null);
    setLoading(false);
  }, [household?.id, sessionLoading, user?.uid]);

  useEffect(() => {
    if (sessionLoading) {
      setLoading(true);
      return;
    }
    void refresh();
  }, [refresh, sessionLoading]);

  const availableCount = gifts.filter((g) => g.status === 'available').length;

  return { gifts, availableCount, loading, error, refresh };
}
