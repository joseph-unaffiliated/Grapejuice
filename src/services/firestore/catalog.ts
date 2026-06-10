import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { CatalogItem } from '../../types/pilot';

const CATALOG_HOLIDAY = 'hanukkah';

function itemsCollection() {
  if (!db) return null;
  return collection(doc(db, 'catalog', CATALOG_HOLIDAY), 'items');
}

function toItem(id: string, data: Record<string, unknown>): CatalogItem {
  return {
    id,
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    slot: data.slot as CatalogItem['slot'],
    slotId: String(data.slotId ?? ''),
    ageGroups: Array.isArray(data.ageGroups) ? (data.ageGroups as CatalogItem['ageGroups']) : [],
    defaultFor: Array.isArray(data.defaultFor) ? (data.defaultFor as CatalogItem['defaultFor']) : [],
    swapOptions: Array.isArray(data.swapOptions) ? (data.swapOptions as string[]) : [],
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
    dollarCostCents: Number(data.dollarCostCents ?? 0),
    holiday: String(data.holiday ?? 'hanukkah'),
    curationTags: Array.isArray(data.curationTags)
      ? (data.curationTags as CatalogItem['curationTags'])
      : undefined,
    brand: typeof data.brand === 'string' ? data.brand : undefined,
  };
}

export const catalogService = {
  async getAll(): Promise<CatalogItem[]> {
    const col = itemsCollection();
    if (!col) return [];
    const snap = await getDocs(col);
    return snap.docs.map((d) => toItem(d.id, d.data() as Record<string, unknown>));
  },

  async getById(itemId: string): Promise<CatalogItem | null> {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'catalog', CATALOG_HOLIDAY, 'items', itemId));
    if (!snap.exists()) return null;
    return toItem(snap.id, snap.data() as Record<string, unknown>);
  },

  async getMany(ids: string[]): Promise<CatalogItem[]> {
    const items = await Promise.all(ids.map((id) => this.getById(id)));
    return items.filter((i): i is CatalogItem => i != null);
  },
};
