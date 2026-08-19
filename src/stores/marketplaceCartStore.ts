import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoxLineItem } from '../types/pilot';

/** Soft cap so the header badge stays readable. */
export const MAX_MARKETPLACE_CART_QTY = 99;

function lineQty(item: Pick<BoxLineItem, 'quantity'>): number {
  return Math.max(1, item.quantity || 1);
}

function clampQty(quantity: number): number {
  return Math.min(MAX_MARKETPLACE_CART_QTY, Math.max(1, Math.floor(quantity)));
}

type MarketplaceCartState = {
  items: BoxLineItem[];
  addItem: (item: BoxLineItem) => void;
  removeItem: (itemId: string) => void;
  /** Set an existing line's quantity. Values below 1 remove the line. */
  setQuantity: (itemId: string, quantity: number) => void;
  /** Increment or decrement an existing line. At 0, the line is removed. */
  changeQuantity: (itemId: string, delta: number) => void;
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
        const existing = items.find((li) => li.itemId === item.itemId);
        const addBy = Math.max(1, item.quantity || 1);
        if (existing) {
          const nextQty = clampQty(lineQty(existing) + addBy);
          set({
            items: items.map((li) =>
              li.itemId === item.itemId ? { ...li, quantity: nextQty } : li
            ),
          });
          return;
        }
        set({ items: [...items, { ...item, quantity: clampQty(addBy) }] });
      },
      removeItem: (itemId) => {
        set({ items: get().items.filter((li) => li.itemId !== itemId) });
      },
      setQuantity: (itemId, quantity) => {
        const q = Math.floor(quantity);
        if (q < 1) {
          set({ items: get().items.filter((li) => li.itemId !== itemId) });
          return;
        }
        const items = get().items;
        if (!items.some((li) => li.itemId === itemId)) return;
        set({
          items: items.map((li) =>
            li.itemId === itemId ? { ...li, quantity: clampQty(q) } : li
          ),
        });
      },
      changeQuantity: (itemId, delta) => {
        const existing = get().items.find((li) => li.itemId === itemId);
        if (!existing) return;
        get().setQuantity(itemId, lineQty(existing) + delta);
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
