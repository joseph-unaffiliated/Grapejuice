import { useEffect, useState } from 'react';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';
import { arrivesByWithWaitLabel } from '../constants/hanukkahBoxLock';

/** `Arrives by Nov 21, about 6 weeks from now.` from live config. */
export function useArrivesByWithWait(): string {
  const [deliveryBy, setDeliveryBy] = useState<string | null>(
    () => peekHanukkahConfig()?.estimatedDeliveryBy ?? null
  );
  useEffect(() => {
    let live = true;
    getHanukkahConfig()
      .then((config) => {
        if (live) setDeliveryBy(config.estimatedDeliveryBy);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return arrivesByWithWaitLabel(deliveryBy);
}
