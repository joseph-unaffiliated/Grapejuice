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
  /** Unaffiliated newsletter reader (`?userID=` on their email link, see public/index.html). */
  unaffiliatedUserID: string | null;
};

const UNAFFILIATED_USER_ID_KEY = 'gj.unaffiliatedUserID';

function readUnaffiliatedUserId(): string | null {
  try {
    return localStorage.getItem(UNAFFILIATED_USER_ID_KEY);
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieDomain(): string {
  const host = window.location.hostname;
  return host === 'grapejuice.co' || host.endsWith('.grapejuice.co') ? '; domain=.grapejuice.co' : '';
}

/** Cookie copy of the campaign touch: Meta's in-app browsers can drop localStorage between loads. */
const ATTRIBUTION_COOKIE = 'gj_attr';

const isCampaignTouch = (t: AttributionTouch | null | undefined): boolean => Boolean(t?.utm || t?.fbclid);

function readAttributionCookie(): StoredAttribution | null {
  const raw = readCookie(ATTRIBUTION_COOKIE);
  if (!raw) return null;
  try {
    const touch = JSON.parse(raw) as AttributionTouch;
    if (!isCampaignTouch(touch) || !touch.at) return null;
    return { firstTouch: touch, lastTouch: touch, fbc: null };
  } catch {
    return null;
  }
}

function writeAttributionCookie(touch: AttributionTouch): void {
  const slim: AttributionTouch = { ...touch, referrer: touch.referrer?.slice(0, 120) ?? null };
  document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(slim))}; max-age=${
    ATTRIBUTION_WINDOW_MS / 1000
  }; path=/; SameSite=Lax${cookieDomain()}`;
}

function readStoredAttribution(): StoredAttribution | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  let parsed: StoredAttribution | null = null;
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    parsed = raw ? (JSON.parse(raw) as StoredAttribution) : null;
  } catch {
    parsed = null;
  }
  if (!parsed?.firstTouch || !parsed?.lastTouch) return readAttributionCookie();
  if (Date.now() - new Date(parsed.lastTouch.at).getTime() > ATTRIBUTION_WINDOW_MS) {
    try {
      localStorage.removeItem(ATTRIBUTION_KEY);
    } catch {
      // ignore
    }
    return readAttributionCookie();
  }
  return parsed;
}

function writeStoredAttribution(value: StoredAttribution): void {
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
  try {
    if (isCampaignTouch(value.lastTouch)) writeAttributionCookie(value.lastTouch);
  } catch {
    // ignore
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
    const stored = readStoredAttribution();

    let fbc = stored?.fbc ?? null;
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
      document.cookie = `_fbc=${encodeURIComponent(fbc)}; max-age=${FBC_COOKIE_MAX_AGE_S}; path=/; SameSite=Lax${cookieDomain()}`;
    }

    if (!stored) {
      writeStoredAttribution({ firstTouch: touch, lastTouch: touch, fbc });
    } else if (isCampaignTouch(touch)) {
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
  const unaffiliatedUserID = readUnaffiliatedUserId();
  if (!stored && !fbc && !fbp && !unaffiliatedUserID) return null;
  return {
    firstTouch: stored?.firstTouch ?? null,
    lastTouch: stored?.lastTouch ?? null,
    fbc,
    fbp,
    unaffiliatedUserID,
  };
}
