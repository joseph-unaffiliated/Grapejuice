import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type {
  AgeGroup,
  CatalogCurationTag,
  CatalogItem,
  CatalogPricingTier,
  CatalogSlot,
} from '../../types/pilot';

export const CATALOG_HOLIDAY = 'hanukkah';

const AGE_GROUPS: AgeGroup[] = ['0-2', '3-5', '6-8', '9-12'];
const SLOTS: CatalogSlot[] = ['base', 'story', 'gift', 'addon', 'keepsake'];
const PRICING_TIERS: CatalogPricingTier[] = ['included', 'perKid', 'extra', 'alaCarte'];
const CURATION_TAGS: CatalogCurationTag[] = [
  'hanukkiah',
  'dreidel',
  'apparel',
  'decorations',
  'collection',
];

export const CATALOG_FIELD_OPTIONS = {
  ageGroups: AGE_GROUPS,
  slots: SLOTS,
  pricingTiers: PRICING_TIERS,
  curationTags: CURATION_TAGS,
} as const;

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
    imageUrls: Array.isArray(data.imageUrls)
      ? (data.imageUrls as unknown[]).filter((u): u is string => typeof u === 'string')
      : undefined,
    dollarCostCents: Number(data.dollarCostCents ?? 0),
    unitCostCents:
      data.unitCostCents != null ? Number(data.unitCostCents) : undefined,
    memberPriceCents:
      data.memberPriceCents != null ? Number(data.memberPriceCents) : undefined,
    nonMemberPriceCents:
      data.nonMemberPriceCents != null ? Number(data.nonMemberPriceCents) : undefined,
    pricingTier:
      typeof data.pricingTier === 'string'
        ? (data.pricingTier as CatalogPricingTier)
        : undefined,
    holiday: String(data.holiday ?? CATALOG_HOLIDAY),
    curationTags: Array.isArray(data.curationTags)
      ? (data.curationTags as CatalogItem['curationTags'])
      : undefined,
    storefrontRails: Array.isArray(data.storefrontRails)
      ? (data.storefrontRails as unknown[]).filter((r): r is string => typeof r === 'string')
      : undefined,
    storefrontRank:
      data.storefrontRank != null && Number.isFinite(Number(data.storefrontRank))
        ? Number(data.storefrontRank)
        : undefined,
    brand: typeof data.brand === 'string' ? data.brand : undefined,
    category: typeof data.category === 'string' ? data.category : undefined,
    context: Array.isArray(data.context)
      ? (data.context as unknown[]).filter((c): c is string => typeof c === 'string')
      : undefined,
    airtableRecordId:
      typeof data.airtableRecordId === 'string' ? data.airtableRecordId : undefined,
    buyLink: typeof data.buyLink === 'string' ? data.buyLink : undefined,
    interest: typeof data.interest === 'string' ? data.interest : undefined,
    dimensions: typeof data.dimensions === 'string' && data.dimensions.trim() ? data.dimensions : undefined,
    weight: typeof data.weight === 'string' && data.weight.trim() ? data.weight : undefined,
    materials: typeof data.materials === 'string' && data.materials.trim() ? data.materials : undefined,
    whatsIncluded:
      typeof data.whatsIncluded === 'string' && data.whatsIncluded.trim()
        ? data.whatsIncluded
        : undefined,
    careNotes: typeof data.careNotes === 'string' && data.careNotes.trim() ? data.careNotes : undefined,
    defaultSlot: typeof data.defaultSlot === 'string' ? data.defaultSlot : null,
    boxSections: Array.isArray(data.boxSections)
      ? (data.boxSections as unknown[]).filter((s): s is string => typeof s === 'string')
      : undefined,
    defaultBookAges: Array.isArray(data.defaultBookAges)
      ? (data.defaultBookAges as unknown[]).filter(
          (x): x is string | number => typeof x === 'string' || typeof x === 'number'
        )
      : undefined,
    defaultGiftAges: Array.isArray(data.defaultGiftAges)
      ? (data.defaultGiftAges as unknown[]).filter(
          (x): x is string | number => typeof x === 'string' || typeof x === 'number'
        )
      : undefined,
    inventory: typeof data.inventory === 'number' ? data.inventory : null,
    holdInventory: typeof data.holdInventory === 'boolean' ? data.holdInventory : null,
    wrappable: typeof data.wrappable === 'boolean' ? data.wrappable : null,
  };
}

/** Slug id from a display name — create-only; never rename existing docs. */
export function slugifyCatalogId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'item';
}

export type CatalogUpsertInput = Omit<CatalogItem, 'holiday'> & {
  holiday?: string;
};

function toFirestorePayload(item: CatalogUpsertInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: item.name.trim(),
    description: item.description.trim(),
    slot: item.slot,
    slotId: item.slotId.trim(),
    ageGroups: item.ageGroups,
    defaultFor: item.defaultFor,
    swapOptions: item.swapOptions.map((s) => s.trim()).filter(Boolean),
    dollarCostCents: Math.max(0, Math.round(item.dollarCostCents)),
    holiday: item.holiday?.trim() || CATALOG_HOLIDAY,
    updatedAt: serverTimestamp(),
  };
  if (item.imageUrl?.trim()) payload.imageUrl = item.imageUrl.trim();
  else payload.imageUrl = null;
  if (item.brand?.trim()) payload.brand = item.brand.trim();
  else payload.brand = null;
  if (item.pricingTier) payload.pricingTier = item.pricingTier;
  else payload.pricingTier = null;
  if (item.curationTags?.length) payload.curationTags = item.curationTags;
  else payload.curationTags = null;
  if (item.storefrontRails?.length) payload.storefrontRails = item.storefrontRails;
  else payload.storefrontRails = null;
  if (item.storefrontRank != null && Number.isFinite(item.storefrontRank)) {
    payload.storefrontRank = item.storefrontRank;
  } else {
    payload.storefrontRank = null;
  }
  return payload;
}

function sortItems(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

export const catalogService = {
  async getAll(): Promise<CatalogItem[]> {
    const col = itemsCollection();
    if (!col) return [];
    const snap = await getDocs(col);
    return sortItems(
      snap.docs.map((d) => toItem(d.id, d.data() as Record<string, unknown>))
    );
  },

  /**
   * Live catalog — Airtable sync writes here; screens should subscribe so
   * updates appear without a full reload.
   */
  subscribeAll(
    onChange: (items: CatalogItem[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const col = itemsCollection();
    if (!col) {
      onChange([]);
      return () => undefined;
    }
    return onSnapshot(
      col,
      (snap) => {
        onChange(
          sortItems(
            snap.docs.map((d) => toItem(d.id, d.data() as Record<string, unknown>))
          )
        );
      },
      (err) => onError?.(err)
    );
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

  /**
   * Create or overwrite a catalog item. Caller must be an allowlisted admin
   * (enforced by Firestore rules + UI gate).
   */
  async upsert(item: CatalogUpsertInput): Promise<CatalogItem> {
    if (!db) throw new Error('Firebase is not configured.');
    const id = item.id.trim();
    if (!id) throw new Error('Item id is required.');
    if (!item.name.trim()) throw new Error('Name is required.');
    if (!item.slotId.trim()) throw new Error('Slot id is required.');

    const ref = doc(db, 'catalog', CATALOG_HOLIDAY, 'items', id);
    await setDoc(ref, toFirestorePayload(item), { merge: true });
    const saved = await this.getById(id);
    if (!saved) throw new Error('Saved item could not be reloaded.');
    return saved;
  },

  async idExists(itemId: string): Promise<boolean> {
    if (!db) return false;
    const snap = await getDoc(doc(db, 'catalog', CATALOG_HOLIDAY, 'items', itemId));
    return snap.exists();
  },

  /** Permanently remove a catalog item. Admin-only (Firestore rules). */
  async remove(itemId: string): Promise<void> {
    if (!db) throw new Error('Firebase is not configured.');
    const id = itemId.trim();
    if (!id) throw new Error('Item id is required.');
    await deleteDoc(doc(db, 'catalog', CATALOG_HOLIDAY, 'items', id));
  },
};
