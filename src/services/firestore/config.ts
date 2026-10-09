import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

import { DEFAULT_BOX_PRICE_CENTS } from '../box/pricing';
import {
  HANUKKAH_BOX_LOCK_DATE,
  HANUKKAH_DELIVERY_FALLBACK_ISO,
  HANUKKAH_STARTS_FALLBACK_ISO,
} from '../../constants/hanukkahBoxLock';

export type HanukkahConfig = {
  lockAt: string | null;
  expeditedLockAt: string | null;
  estimatedDeliveryBy: string | null;
  startsOn: string | null;
  boxPriceCents: number;
  expeditedShippingEnabled?: boolean;
  expeditedDeliveryBy?: string | null;
};

/** Last successful fetch — chrome remounts (e.g. Rav dock) read this to avoid promo flash. */
let hanukkahConfigCache: HanukkahConfig | null = null;
let hanukkahConfigFetchedAt = 0;
let hanukkahConfigInflight: Promise<HanukkahConfig> | null = null;

/** Cached config is served instantly; older than this triggers a background refresh. */
const HANUKKAH_CONFIG_FRESH_MS = 60_000;

/** Sync peek of cached Hanukkah config (null until the first fetch completes). */
export function peekHanukkahConfig(): HanukkahConfig | null {
  return hanukkahConfigCache;
}

/**
 * Stale-while-revalidate: screens mount without a Firestore round trip once the
 * config has loaded. Pass `fresh` where a just-read value matters (checkout).
 */
export async function getHanukkahConfig(opts?: { fresh?: boolean }): Promise<HanukkahConfig> {
  if (hanukkahConfigCache && !opts?.fresh) {
    if (Date.now() - hanukkahConfigFetchedAt > HANUKKAH_CONFIG_FRESH_MS) {
      void fetchHanukkahConfig().catch(() => undefined);
    }
    return hanukkahConfigCache;
  }
  return fetchHanukkahConfig().catch((err) => {
    // getDoc rejects when the client thinks it's offline; never leave screens on a loader.
    console.warn('[config] hanukkah config read failed', err);
    return hanukkahConfigCache ?? fallbackHanukkahConfig();
  });
}

function fallbackHanukkahConfig(): HanukkahConfig {
  return {
    lockAt: HANUKKAH_BOX_LOCK_DATE.toISOString(),
    expeditedLockAt: null,
    estimatedDeliveryBy: HANUKKAH_DELIVERY_FALLBACK_ISO,
    startsOn: HANUKKAH_STARTS_FALLBACK_ISO,
    boxPriceCents: DEFAULT_BOX_PRICE_CENTS,
  };
}

function fetchHanukkahConfig(): Promise<HanukkahConfig> {
  if (hanukkahConfigInflight) return hanukkahConfigInflight;

  hanukkahConfigInflight = (async () => {
    if (!db) {
      const empty: HanukkahConfig = {
        lockAt: null,
        expeditedLockAt: null,
        estimatedDeliveryBy: null,
        startsOn: null,
        boxPriceCents: DEFAULT_BOX_PRICE_CENTS,
      };
      hanukkahConfigCache = empty;
      hanukkahConfigFetchedAt = Date.now();
      return empty;
    }
    const snap = await getDoc(doc(db, 'config', 'hanukkah-2026'));
    const d = snap.data() ?? {};
    const next: HanukkahConfig = {
      lockAt: (d.lockAt as string) ?? null,
      expeditedLockAt: (d.expeditedLockAt as string) ?? null,
      estimatedDeliveryBy: (d.estimatedDeliveryBy as string) ?? null,
      startsOn: (d.startsOn as string) ?? null,
      boxPriceCents: typeof d.boxPriceCents === 'number' ? d.boxPriceCents : DEFAULT_BOX_PRICE_CENTS,
      expeditedShippingEnabled: d.expeditedShippingEnabled === true,
      expeditedDeliveryBy: (d.expeditedDeliveryBy as string) ?? null,
    };
    hanukkahConfigCache = next;
    hanukkahConfigFetchedAt = Date.now();
    return next;
  })().finally(() => {
    hanukkahConfigInflight = null;
  });

  return hanukkahConfigInflight;
}

export function effectiveLockAt(config: Pick<HanukkahConfig, 'lockAt' | 'expeditedLockAt'>, expeditedShipping: boolean): string | null {
  if (expeditedShipping && config.expeditedLockAt) return config.expeditedLockAt;
  return config.lockAt;
}

export function isBoxLocked(lockAt: string | null, now: Date = new Date()): boolean {
  if (!lockAt) return false;
  return now.getTime() >= new Date(lockAt).getTime();
}

export type PassoverWaitlistConfig = {
  capacityPercent: number;
  active: boolean;
};

const DEFAULT_PASSOVER_CAPACITY = 39;

export async function getPassoverWaitlistConfig(): Promise<PassoverWaitlistConfig> {
  if (!db) {
    return { capacityPercent: DEFAULT_PASSOVER_CAPACITY, active: true };
  }
  const snap = await getDoc(doc(db, 'config', 'passover-2027-waitlist'));
  const d = snap.data() ?? {};
  const raw =
    typeof d.capacityPercent === 'number'
      ? d.capacityPercent
      : typeof d.filledPercent === 'number'
        ? d.filledPercent
        : DEFAULT_PASSOVER_CAPACITY;
  return {
    capacityPercent: Math.min(100, Math.max(0, Math.round(raw))),
    active: d.active !== false,
  };
}
