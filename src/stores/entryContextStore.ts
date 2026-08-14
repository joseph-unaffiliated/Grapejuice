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
