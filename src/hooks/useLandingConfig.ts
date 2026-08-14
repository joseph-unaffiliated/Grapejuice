import { useCallback, useEffect, useState } from 'react';
import {
  landingAudienceById,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import {
  hydrateLandingConfig,
  landingsService,
} from '../services/firestore/landings';
import { invalidateLandingCatalog } from '../services/landingCatalog';

export type LandingConfigSource = 'code' | 'firestore';

/**
 * Resolve a marketing landing: Firestore override / CMS-only doc, else code seed.
 */
export function useLandingConfig(audienceId: string): {
  config: LandingAudienceConfig | null;
  source: LandingConfigSource;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const codeConfig = landingAudienceById(audienceId);
  const [config, setConfig] = useState<LandingAudienceConfig | null>(codeConfig);
  const [source, setSource] = useState<LandingConfigSource>(codeConfig ? 'code' : 'firestore');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const base = landingAudienceById(audienceId);

    setLoading(true);
    setError(null);
    landingsService
      .getById(audienceId)
      .then((stored) => {
        if (cancelled) return;
        if (stored?.sections?.length) {
          setConfig(hydrateLandingConfig(stored, audienceId));
          setSource('firestore');
          invalidateLandingCatalog();
          return;
        }
        if (base) {
          setConfig(base);
          setSource('code');
          return;
        }
        setConfig(null);
        setSource('firestore');
        setError('Landing not found');
      })
      .catch((err) => {
        if (cancelled) return;
        if (base) {
          setConfig(base);
          setSource('code');
        } else {
          setConfig(null);
        }
        setError(err instanceof Error ? err.message : 'Failed to load landing');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audienceId, tick]);

  return { config, source, loading, error, refresh };
}
