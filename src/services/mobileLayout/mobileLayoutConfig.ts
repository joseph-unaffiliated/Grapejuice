/**
 * The kill switch for the mobile layouts: Firestore `config/mobile` `{ enabled: boolean }`.
 * Read once per session (stale-while-revalidate like the Hanukkah config), default off.
 * Flipping the document returns every phone visitor to today's screens on their next
 * load, with no deploy.
 */
import { Platform } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  MOBILE_OVERRIDE_QUERY,
  MOBILE_OVERRIDE_STORAGE_KEY,
  mobileLayoutTag,
  parseMobileOverride,
  type MobileOverride,
} from './mobileLayoutRules';

type Listener = (enabled: boolean) => void;

let enabledCache: boolean | null = null;
let fetchedAt = 0;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<Listener>();
const FRESH_MS = 5 * 60_000;

export function peekMobileLayoutEnabled(): boolean | null {
  return enabledCache;
}

export async function getMobileLayoutEnabled(): Promise<boolean> {
  if (enabledCache != null && Date.now() - fetchedAt < FRESH_MS) return enabledCache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'mobile'));
      const enabled = snap.exists() && snap.data()?.enabled === true;
      enabledCache = enabled;
      fetchedAt = Date.now();
      listeners.forEach((l) => l(enabled));
      return enabled;
    } catch {
      // A failed read keeps whatever we had, or off.
      return enabledCache ?? false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function subscribeMobileLayoutEnabled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `?mbx=new|control` sticks for the browser session so every page in a review keeps the same layout. */
export function readMobileOverride(): MobileOverride {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const fromQuery = parseMobileOverride(new URLSearchParams(window.location.search).get(MOBILE_OVERRIDE_QUERY));
    if (fromQuery) {
      window.sessionStorage.setItem(MOBILE_OVERRIDE_STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    return parseMobileOverride(window.sessionStorage.getItem(MOBILE_OVERRIDE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** For tests and the admin panel. */
export function __setMobileLayoutEnabledForTests(value: boolean | null): void {
  enabledCache = value;
  fetchedAt = value == null ? 0 : Date.now();
}

let lastTag: 'new' | 'control' | null = null;

/** Analytics read this synchronously (Meta params, GA, Clarity) without needing the hook. */
export function currentMobileLayoutTag(): 'new' | 'control' | null {
  return lastTag;
}

export function rememberLayoutForAnalytics(isNew: boolean): void {
  const tag = mobileLayoutTag(isNew);
  if (tag === lastTag) return;
  lastTag = tag;
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as {
      clarity?: (cmd: string, key: string, value: string) => void;
      gtag?: (...args: unknown[]) => void;
    };
    w.clarity?.('set', 'mobileLayout', tag);
    w.gtag?.('set', 'user_properties', { mobile_layout: tag });
  } catch {
    // Analytics must never break the app.
  }
}
