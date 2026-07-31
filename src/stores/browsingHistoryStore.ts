import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_ENTRIES = 40;

export type BrowsingHistoryEntry = {
  itemId: string;
  name: string;
  viewedAt: string;
};

type BrowsingHistoryState = {
  entries: BrowsingHistoryEntry[];
  recordView: (item: { id: string; name: string }) => void;
  dismiss: (itemId: string) => void;
  clear: () => void;
};

export const useBrowsingHistoryStore = create<BrowsingHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      recordView: (item) => {
        const id = item.id.trim();
        const name = item.name.trim() || id;
        if (!id) return;
        const viewedAt = new Date().toISOString();
        const rest = get().entries.filter((e) => e.itemId !== id);
        set({
          entries: [{ itemId: id, name, viewedAt }, ...rest].slice(0, MAX_ENTRIES),
        });
      },
      dismiss: (itemId) => {
        set({ entries: get().entries.filter((e) => e.itemId !== itemId) });
      },
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'grapejuice-browsing-history',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
    }
  )
);
