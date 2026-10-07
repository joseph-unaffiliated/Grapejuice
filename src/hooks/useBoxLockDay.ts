import { useEffect, useState } from 'react';
import { boxLockDayLabel } from '../constants/hanukkahBoxLock';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';

/** Lock day label (`Nov 7`) from live config, with the built-in fallback until it loads. */
export function useBoxLockDay(): string {
  const [lockAt, setLockAt] = useState<string | null>(() => peekHanukkahConfig()?.lockAt ?? null);

  useEffect(() => {
    let cancelled = false;
    void getHanukkahConfig().then((config) => {
      if (!cancelled) setLockAt(config.lockAt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return boxLockDayLabel(lockAt);
}
