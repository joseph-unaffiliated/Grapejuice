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
