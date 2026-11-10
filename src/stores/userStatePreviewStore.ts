import { create } from 'zustand';

/**
 * Admin-only overlays for previewing storefront / box chrome without signing out
 * or mutating real household data. `null` = live (real session).
 */
export type UserStatePreview =
  | 'signed_out'
  | 'signed_out_box'
  | 'signed_in_no_box'
  | 'signed_in_box'
  | 'signed_in_needs_payment'
  | 'signed_in_locked';

export type UserStatePreviewOption = {
  id: UserStatePreview | null;
  label: string;
  description: string;
};

export const USER_STATE_PREVIEW_OPTIONS: UserStatePreviewOption[] = [
  {
    id: null,
    label: 'Live (you)',
    description: 'Exact same chrome as your real account (no persona overlays)',
  },
  { id: 'signed_out', label: 'Signed out', description: 'Guest, no box — same path as real guests' },
  {
    id: 'signed_out_box',
    label: 'Signed out · box started',
    description: 'Guest with a started box — same as real guest_box / shop after lock',
  },
  {
    id: 'signed_in_no_box',
    label: 'Signed in · no box',
    description: 'Cold signed-in shopper — acquisition before lock, shop after',
  },
  {
    id: 'signed_in_box',
    label: 'Signed in · box',
    description: 'Paid/open customize before lock; shop after (pin a pre-lock day to edit)',
  },
  {
    id: 'signed_in_needs_payment',
    label: 'Signed in · needs payment',
    description: 'Unpaid draft gated before lock; shop after (pin a pre-lock day for gate)',
  },
  {
    id: 'signed_in_locked',
    label: 'Signed in · locked',
    description: 'Post-lock box holder — shop + Orders (stand-in order if you have none)',
  },
];

type UserStatePreviewState = {
  preview: UserStatePreview | null;
  /** Calendar day override `YYYY-MM-DD` for countdown / timeline pin. `null` = real now. */
  previewNowIso: string | null;
  setPreview: (preview: UserStatePreview | null) => void;
  setPreviewNowIso: (iso: string | null) => void;
  clearPreview: () => void;
};

export const useUserStatePreviewStore = create<UserStatePreviewState>((set) => ({
  preview: null,
  previewNowIso: null,
  setPreview: (preview) => set({ preview }),
  setPreviewNowIso: (previewNowIso) => set({ previewNowIso }),
  clearPreview: () => set({ preview: null, previewNowIso: null }),
}));

/** Parse admin preview day to local noon; falls back to real now. */
export function dateFromPreviewNowIso(iso: string | null | undefined): Date {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatPreviewNowIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
