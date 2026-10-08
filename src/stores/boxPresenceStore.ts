import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Most recent signed-in answer, for cold loads before the session knows the household. */
export const LAST_SIGNED_IN_KEY = 'last-signed-in';

type BoxPresenceState = {
  /** Last resolved “has a Hanukkah box” answer, keyed by household id (plus LAST_SIGNED_IN_KEY). */
  byKey: Record<string, boolean>;
  setHasBox: (householdId: string, hasBox: boolean) => void;
  clearLastSignedIn: () => void;
};

/**
 * Survives screen remounts and reloads so the header keeps the box icon while the next
 * page loads the draft. Firestore is still the source of truth once that load finishes.
 */
export const useBoxPresenceStore = create<BoxPresenceState>()(
  persist(
    (set) => ({
      byKey: {},
      setHasBox: (householdId, hasBox) =>
        set((state) =>
          state.byKey[householdId] === hasBox && state.byKey[LAST_SIGNED_IN_KEY] === hasBox
            ? state
            : { byKey: { ...state.byKey, [householdId]: hasBox, [LAST_SIGNED_IN_KEY]: hasBox } }
        ),
      clearLastSignedIn: () =>
        set((state) => {
          const { [LAST_SIGNED_IN_KEY]: _dropped, ...rest } = state.byKey;
          return { byKey: rest };
        }),
    }),
    {
      name: 'grapejuice-box-presence',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ byKey: state.byKey }),
    }
  )
);
