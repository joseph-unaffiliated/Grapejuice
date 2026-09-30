import { Platform } from 'react-native';
import { create } from 'zustand';

const STORAGE_KEY = 'gj.entryContext';

export type EntryUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

type EntryContextState = {
  audienceId: string | null;
  sourcePath: string | null;
  utm: EntryUtm | null;
  /** Capture entry for this browser session (sessionStorage on web). */
  capture: (input: {
    audienceId: string;
    sourcePath?: string | null;
    utm?: EntryUtm | null;
  }) => void;
  clear: () => void;
};

function readSession(): Pick<EntryContextState, 'audienceId' | 'sourcePath' | 'utm'> | null {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      audienceId?: string | null;
      sourcePath?: string | null;
      utm?: EntryUtm | null;
    };
    if (!parsed?.audienceId) return null;
    const rawId = parsed.audienceId === 'unaffiliated' ? 'cultural' : parsed.audienceId;
    return {
      audienceId: rawId,
      sourcePath: parsed.sourcePath ?? null,
      utm: parsed.utm ?? null,
    };
  } catch {
    return null;
  }
}

function writeSession(state: Pick<EntryContextState, 'audienceId' | 'sourcePath' | 'utm'>): void {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
  try {
    if (!state.audienceId) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        audienceId: state.audienceId,
        sourcePath: state.sourcePath,
        utm: state.utm,
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

const hydrated = readSession();

export const useEntryContextStore = create<EntryContextState>((set) => ({
  audienceId: hydrated?.audienceId ?? null,
  sourcePath: hydrated?.sourcePath ?? null,
  utm: hydrated?.utm ?? null,
  capture: ({ audienceId, sourcePath = null, utm = null }) => {
    const next = { audienceId, sourcePath, utm };
    writeSession(next);
    set(next);
  },
  clear: () => {
    writeSession({ audienceId: null, sourcePath: null, utm: null });
    set({ audienceId: null, sourcePath: null, utm: null });
  },
}));

/** Read UTM params from the current window (web only). */
export function readUtmFromWindow(): EntryUtm | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const utm: EntryUtm = {
    source: q.get('utm_source')?.trim() || undefined,
    medium: q.get('utm_medium')?.trim() || undefined,
    campaign: q.get('utm_campaign')?.trim() || undefined,
    content: q.get('utm_content')?.trim() || undefined,
    term: q.get('utm_term')?.trim() || undefined,
  };
  if (!utm.source && !utm.medium && !utm.campaign && !utm.content && !utm.term) return null;
  return utm;
}

const ATTRIBUTION_KEY = 'gj.attribution';
/** Matches Meta's default 28-day click window. */
const ATTRIBUTION_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
const FBC_COOKIE_MAX_AGE_S = 90 * 24 * 60 * 60;

export type AttributionTouch = {
  utm: EntryUtm | null;
  fbclid: string | null;
  landingPath: string;
  referrer: string | null;
  at: string;
};

type StoredAttribution = {
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
  /** `fb.1.<ms>.<fbclid>` from the most recent Meta ad click. */
  fbc: string | null;
};

/** Written to `users/{uid}`, orders, and gifts. Firestore-safe (no undefined). */
export type AttributionSnapshot = {
  firstTouch: AttributionTouch | null;
  lastTouch: AttributionTouch | null;
  fbc: string | null;
  fbp: string | null;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieDomain(): string {
  const host = window.location.hostname;
  return host === 'grapejuice.co' || host.endsWith('.grapejuice.co') ? '; domain=.grapejuice.co' : '';
}

function readStoredAttribution(): StoredAttribution | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed?.firstTouch || !parsed?.lastTouch) return null;
    if (Date.now() - new Date(parsed.lastTouch.at).getTime() > ATTRIBUTION_WINDOW_MS) {
      localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAttribution(value: StoredAttribution): void {
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

let attributionCaptured = false;

/**
 * Record this entry's UTMs / fbclid before in-app navigation rewrites the URL.
 * First touch sticks for 28 days; last touch moves on every campaign click.
 */
export function captureAttributionFromWindow(): void {
  if (attributionCaptured) return;
  attributionCaptured = true;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const q = new URLSearchParams(window.location.search);
    const fbclid = q.get('fbclid')?.trim() || null;
    const utm = readUtmFromWindow();
    let referrer: string | null = null;
    try {
      if (document.referrer && new URL(document.referrer).host !== window.location.host) {
        referrer = document.referrer.slice(0, 300);
      }
    } catch {
      referrer = null;
    }
    const touch: AttributionTouch = {
      utm,
      fbclid,
      landingPath: window.location.pathname.slice(0, 200),
      referrer,
      at: new Date().toISOString(),
    };
    const isCampaignTouch = Boolean(utm || fbclid);
    const stored = readStoredAttribution();

    let fbc = stored?.fbc ?? null;
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
      document.cookie = `_fbc=${encodeURIComponent(fbc)}; max-age=${FBC_COOKIE_MAX_AGE_S}; path=/; SameSite=Lax${cookieDomain()}`;
    }

    if (!stored) {
      writeStoredAttribution({ firstTouch: touch, lastTouch: touch, fbc });
    } else if (isCampaignTouch) {
      writeStoredAttribution({ ...stored, lastTouch: touch, fbc });
    }
  } catch {
    // attribution must never break boot
  }
}

/** Meta browser id cookie (set by fbevents.js once the pixel loads). */
export function readFbp(): string | null {
  if (Platform.OS !== 'web') return null;
  return readCookie('_fbp');
}

/** Meta click id: pixel cookie first, else the one we stored from `fbclid`. */
export function readFbc(): string | null {
  if (Platform.OS !== 'web') return null;
  return readCookie('_fbc') ?? readStoredAttribution()?.fbc ?? null;
}

export function readAttributionSnapshot(): AttributionSnapshot | null {
  if (Platform.OS !== 'web') return null;
  const stored = readStoredAttribution();
  const fbc = readFbc();
  const fbp = readFbp();
  if (!stored && !fbc && !fbp) return null;
  return {
    firstTouch: stored?.firstTouch ?? null,
    lastTouch: stored?.lastTouch ?? null,
    fbc,
    fbp,
  };
}
