import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoxLineItem } from '../types/pilot';

type MarketplaceCartState = {
  items: BoxLineItem[];
  addItem: (item: BoxLineItem) => void;
  removeItem: (itemId: string) => void;
  setItems: (items: BoxLineItem[]) => void;
  clear: () => void;
};

/**
 * À la carte marketplace cart — independent of Hanukkah box drafts.
 * Used while the household has not started a box (header shows cart, not My Box).
 */
export const useMarketplaceCartStore = create<MarketplaceCartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const items = get().items;
        if (items.some((li) => li.itemId === item.itemId)) return;
        set({ items: [...items, item] });
      },
      removeItem: (itemId) => {
        set({ items: get().items.filter((li) => li.itemId !== itemId) });
      },
      setItems: (items) => set({ items }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'grapejuice-marketplace-cart',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    }
  )
);

export function marketplaceCartCount(items: BoxLineItem[]): number {
  return items.reduce((sum, li) => sum + Math.max(1, li.quantity || 1), 0);
}
