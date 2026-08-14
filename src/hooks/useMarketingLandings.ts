import { useCallback, useEffect, useState } from 'react';
import { LANDING_REGISTRY, type LandingAudienceConfig } from '../constants/landingAudiences';
import { loadMergedLandings, peekMergedLandings } from '../services/landingCatalog';

/** Live list of marketing landings (seeds + CMS), for footer / test panels. */
export function useMarketingLandings(): {
  landings: LandingAudienceConfig[];
  loading: boolean;
  refresh: () => void;
} {
  const [landings, setLandings] = useState<LandingAudienceConfig[]>(() => peekMergedLandings());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadMergedLandings()
      .then((list) => {
        if (!cancelled) setLandings(list);
      })
      .catch(() => {
        if (!cancelled) setLandings([...LANDING_REGISTRY]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { landings, loading, refresh };
}
