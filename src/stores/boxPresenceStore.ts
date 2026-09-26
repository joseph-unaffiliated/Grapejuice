import { create } from 'zustand';

type BoxPresenceState = {
  /** Last resolved “has a Hanukkah box” answer, keyed by household id (or `guest`). */
  byKey: Record<string, boolean>;
  setHasBox: (key: string, hasBox: boolean) => void;
};

/**
 * Survives screen remounts so the header can keep the box icon while the next
 * page reloads the draft. Firestore is still the source of truth once that load finishes.
 */
export const useBoxPresenceStore = create<BoxPresenceState>((set) => ({
  byKey: {},
  setHasBox: (key, hasBox) =>
    set((state) =>
      state.byKey[key] === hasBox ? state : { byKey: { ...state.byKey, [key]: hasBox } }
    ),
}));
