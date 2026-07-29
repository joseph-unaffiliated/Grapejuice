import type { CatalogCurationTag, CatalogItem } from '../types/pilot';

/** Fallback tags when Firestore items lack curationTags */
const ITEM_CURATION: Record<string, CatalogCurationTag[]> = {
  'family-hanukkiah-keepsake': ['hanukkiah', 'collection'],
  'child-hanukkiah-keepsake': ['hanukkiah', 'collection'],
  'child-hanukkiah-electric': ['hanukkiah', 'collection'],
  'hanukkiah-craft-kit': ['hanukkiah', 'collection'],
  'keepsake-dreidel': ['dreidel', 'collection'],
  'plush-dreidel': ['dreidel', 'collection'],
  'english-hebrew-dreidel': ['dreidel', 'collection'],
  'baby-safe-dreidel': ['dreidel', 'collection'],
  'pyjamas-hanukkah': ['apparel', 'collection'],
  'hanukkah-blanket': ['apparel', 'collection'],
  'display-runner-cloth': ['decorations', 'collection'],
  'cocktail-napkins-party': ['decorations', 'collection'],
  'hanukkah-banner-garland': ['decorations', 'collection'],
};

const BRAND_BY_ID: Record<string, string> = {
  'pyjamas-hanukkah': 'Pottery Barn',
  'hanukkah-blanket': 'Pottery Barn',
  'display-runner-cloth': 'Pottery Barn',
  'cocktail-napkins-party': 'Amazon (Amscan)',
};

export const COLLECTION_RAILS: { tag: CatalogCurationTag; title: string }[] = [
  { tag: 'hanukkiah', title: 'Hanukkiahs' },
  { tag: 'dreidel', title: 'Dreidels' },
];

export const STAGE_SECTIONS: { tag: CatalogCurationTag; title: string }[] = [
  { tag: 'apparel', title: 'Apparel' },
  { tag: 'decorations', title: 'Decorations' },
];

export function getCurationTags(item: CatalogItem): CatalogCurationTag[] {
  if (item.curationTags?.length) return item.curationTags;
  return ITEM_CURATION[item.id] ?? [];
}

export function getItemBrand(item: CatalogItem): string | undefined {
  return item.brand ?? BRAND_BY_ID[item.id];
}

export function filterCatalogByTag(items: CatalogItem[], tag: CatalogCurationTag): CatalogItem[] {
  return items.filter((item) => getCurationTags(item).includes(tag));
}

/** Similar items for PDP — shared curation tag or category, excluding self. */
export function similarCatalogItems(
  item: CatalogItem,
  catalog: CatalogItem[],
  limit = 12
): CatalogItem[] {
  const tags = new Set(getCurationTags(item).filter((t) => t !== 'collection'));
  const scored = catalog
    .filter((c) => c.id !== item.id)
    .map((c) => {
      const cTags = getCurationTags(c);
      const tagHits = cTags.filter((t) => tags.has(t)).length;
      const categoryHit = item.category && c.category === item.category ? 2 : 0;
      const slotHit = c.slotId && c.slotId === item.slotId ? 1 : 0;
      return { c, score: tagHits * 3 + categoryHit + slotHit };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.slice(0, limit).map((row) => row.c);
}
