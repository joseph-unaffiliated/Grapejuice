import { useEffect, useState } from 'react';
import { familyOrderOpen } from '../constants/familyOrder';
import { boxLockDayLabel, HANUKKAH_BOX_LOCK_DATE } from '../constants/hanukkahBoxLock';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';
import { usePreviewNow } from './useUserStatePreview';

export function useLockAt(): string | null {
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

/** Lock day label (`Nov 7`, or `tonight at midnight ET` when it's close) from live config. */
export function useBoxLockDay(): string {
  return boxLockDayLabel(useLockAt(), usePreviewNow());
}

/** True once the Hanukkah box lock has passed (respects the admin preview clock). */
export function useBoxLockPassed(): boolean {
  const lockAt = useLockAt();
  const now = usePreviewNow();
  if (familyOrderOpen()) return false;
  const lock = lockAt ? new Date(lockAt) : HANUKKAH_BOX_LOCK_DATE;
  return now.getTime() > (Number.isNaN(lock.getTime()) ? HANUKKAH_BOX_LOCK_DATE : lock).getTime();
}
