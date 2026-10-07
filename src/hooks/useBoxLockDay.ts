import { useEffect, useState } from 'react';
import { boxLockDayLabel, HANUKKAH_BOX_LOCK_DATE } from '../constants/hanukkahBoxLock';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';
import { usePreviewNow } from './useUserStatePreview';

function useLockAt(): string | null {
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

  return lockAt;
}

/** Lock day label (`Nov 7`) from live config, with the built-in fallback until it loads. */
export function useBoxLockDay(): string {
  return boxLockDayLabel(useLockAt());
}

/** True once the Hanukkah box lock has passed (respects the admin preview clock). */
export function useBoxLockPassed(): boolean {
  const lockAt = useLockAt();
  const now = usePreviewNow();
  const lock = lockAt ? new Date(lockAt) : HANUKKAH_BOX_LOCK_DATE;
  return now.getTime() > (Number.isNaN(lock.getTime()) ? HANUKKAH_BOX_LOCK_DATE : lock).getTime();
}
