import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { getVisitorId } from '../guest/visitorId';
import type { PromoTerms } from './promoPricing';

/**
 * Discount code (this browser session) and influencer link (30 days, last click wins).
 * public/index.html lifts /r/<slug>, ?ref= and ?code= off the landing URL into
 * window.__gjPromoLanding; capturePromoFromWindow() validates and stores them.
 */

const REF_KEY = 'gj.promo.ref';
const CODE_KEY = 'gj.promo.code';
const REF_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

declare global {
  interface Window {
    __gjPromoLanding?: { ref: string | null; code: string | null } | null;
  }
}

export type PromoRequest = { code?: string; ref?: string; refAt?: string };

export type CheckPromoResult = {
  code:
    | null
    | ({ ok: true; code: string; label: string } & PromoTerms)
    | { ok: false; message: string };
  influencer: null | ({ slug: string; name: string; label: string } & PromoTerms);
};

let memoryCode: string | null = null;
const listeners = new Set<() => void>();

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribePromo(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function storedRef(): { slug: string; at: string } | null {
  if (!isWeb()) return null;
  try {
    const raw = window.localStorage.getItem(REF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { slug?: unknown; at?: unknown };
    if (typeof parsed.slug !== 'string' || typeof parsed.at !== 'string') return null;
    if (Date.now() - Date.parse(parsed.at) > REF_WINDOW_MS) {
      window.localStorage.removeItem(REF_KEY);
      return null;
    }
    return { slug: parsed.slug, at: parsed.at };
  } catch {
    return null;
  }
}

function setStoredRef(slug: string): void {
  if (!isWeb()) return;
  try {
    window.localStorage.setItem(REF_KEY, JSON.stringify({ slug, at: new Date().toISOString() }));
  } catch {
    /* private mode */
  }
  notify();
}

export function storedCode(): string | null {
  if (!isWeb()) return memoryCode;
  try {
    return window.sessionStorage.getItem(CODE_KEY) || memoryCode;
  } catch {
    return memoryCode;
  }
}

export function setStoredCode(code: string | null): void {
  memoryCode = code;
  if (isWeb()) {
    try {
      if (code) window.sessionStorage.setItem(CODE_KEY, code);
      else window.sessionStorage.removeItem(CODE_KEY);
    } catch {
      /* private mode */
    }
  }
  notify();
}

/** What checkout callables send. The server validates everything again. */
export function promoForServer(): PromoRequest | undefined {
  const code = storedCode();
  const ref = storedRef();
  if (!code && !ref) return undefined;
  return {
    ...(code ? { code } : {}),
    ...(ref ? { ref: ref.slug, refAt: ref.at } : {}),
  };
}

export async function checkPromo(input: PromoRequest & { visitorId?: string | null; recordVisit?: boolean }) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  const callable = httpsCallable<typeof input, CheckPromoResult>(functions, 'checkPromo');
  const { data } = await callable(input);
  return data;
}

/** Once at boot (App.web.tsx). A ?ref= that isn't one of our influencers never replaces a real one. */
export function capturePromoFromWindow(): void {
  if (!isWeb()) return;
  const landing = window.__gjPromoLanding;
  window.__gjPromoLanding = null;
  if (!landing) return;
  if (landing.code) setStoredCode(landing.code);
  const slug = landing.ref;
  if (!slug) return;
  setTimeout(() => {
    checkPromo({ ref: slug, recordVisit: true, visitorId: getVisitorId() })
      .then((res) => {
        if (res.influencer) setStoredRef(res.influencer.slug);
      })
      .catch(() => setStoredRef(slug));
  }, 1500);
}
