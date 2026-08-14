import { useCallback, useEffect, useState } from 'react';
import {
  landingAudienceById,
  type LandingAudienceConfig,
  type LandingAudienceId,
} from '../constants/landingAudiences';
import {
  hydrateLandingConfig,
  landingsService,
} from '../services/firestore/landings';

export type LandingConfigSource = 'code' | 'firestore';

/**
 * Resolve a marketing landing: Firestore override if present, else code-config.
 */
export function useLandingConfig(audienceId: LandingAudienceId): {
  config: LandingAudienceConfig | null;
  source: LandingConfigSource;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const codeConfig = landingAudienceById(audienceId);
  const [config, setConfig] = useState<LandingAudienceConfig | null>(codeConfig);
  const [source, setSource] = useState<LandingConfigSource>('code');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const base = landingAudienceById(audienceId);
    if (!base) {
      setConfig(null);
      setLoading(false);
      setError('Unknown landing');
      return;
    }

    setLoading(true);
    setError(null);
    landingsService
      .getById(audienceId)
      .then((stored) => {
        if (cancelled) return;
        if (stored?.sections?.length) {
          setConfig(hydrateLandingConfig(stored, audienceId));
          setSource('firestore');
        } else {
          setConfig(base);
          setSource('code');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setConfig(base);
        setSource('code');
        setError(err instanceof Error ? err.message : 'Failed to load landing override');
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
