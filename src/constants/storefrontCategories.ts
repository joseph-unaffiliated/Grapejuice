import type { CatalogItem } from '../types/pilot';
import { getCurationTags } from './catalogCuration';

export type StorefrontCategoryDef = {
  slug: string;
  label: string;
  title: string;
  description: string;
  match: (item: CatalogItem) => boolean;
};

/** Books stay in their own aisle — never mixed into other storefront categories. */
export function isBookItem(item: CatalogItem): boolean {
  if (item.category === 'Book') return true;
  if (item.id.startsWith('book-')) return true;
  if (/book|novel/i.test(item.name)) return true;
  return false;
}

export function isFoodItem(item: CatalogItem): boolean {
  if (isBookItem(item)) return false;
  if (item.category === 'Food') return true;
  return /gelt|latke|sufgan|cookie.?cutter|applesauce|donut/i.test(item.name);
}

export const STOREFRONT_CATEGORIES: StorefrontCategoryDef[] = [
  {
    slug: 'collection',
    label: 'All',
    title: 'The Collection',
    description: 'Everything in the Hanukkah store — menorahs, dreidels, food, books, and more.',
    match: () => true,
  },
  {
    slug: 'menorahs',
    label: 'Menorahs',
    title: 'Menorahs & Hanukkiahs',
    description: 'Keepsakes and statement pieces for every windowsill.',
    match: (item) =>
      !isBookItem(item) &&
      (getCurationTags(item).includes('hanukkiah') ||
        item.category === 'Menorah' ||
        /menorah|hanukkiah/i.test(item.name)),
  },
  {
    slug: 'dreidels',
    label: 'Dreidels',
    title: 'Dreidels',
    description: 'Spin, play, and pass them down.',
    match: (item) =>
      !isBookItem(item) &&
      (getCurationTags(item).includes('dreidel') ||
        item.category === 'Dreidel' ||
        /dreidel/i.test(item.name)),
  },
  {
    slug: 'candles',
    label: 'Candles',
    title: 'Candles',
    description: 'Wax and light for eight nights.',
    match: (item) =>
      !isBookItem(item) && (item.category === 'Candles' || /candle/i.test(item.name)),
  },
  {
    slug: 'food',
    label: 'Food',
    title: 'Food',
    description: 'Gelt, latkes, sufganiyot, and soft treats.',
    match: isFoodItem,
  },
  {
    slug: 'decor',
    label: 'Decor',
    title: 'Table & Decor',
    description: 'Runners, napkins, and pieces that set the stage.',
    match: (item) =>
      !isBookItem(item) &&
      !isFoodItem(item) &&
      (getCurationTags(item).includes('decorations') ||
        item.category === 'Other' ||
        /runner|napkin|banner|garland|decor/i.test(item.name)),
  },
  {
    slug: 'books',
    label: 'Books',
    title: 'Books',
    description: 'Stories for the couch and the kids’ room.',
    match: isBookItem,
  },
  {
    slug: 'gifts',
    label: 'Gifts',
    title: 'Gifts',
    description: 'Apparel, activities, and small joys ready to wrap.',
    match: (item) =>
      !isBookItem(item) &&
      !isFoodItem(item) &&
      (getCurationTags(item).includes('apparel') ||
        item.category === 'Activity' ||
        /gift|pyjama|pajama|blanket/i.test(item.name)),
  },
];

export const DEFAULT_STOREFRONT_CATEGORY = 'menorahs';

export function storefrontCategoryBySlug(slug: string): StorefrontCategoryDef | undefined {
  const clean = slug.trim().toLowerCase();
  return STOREFRONT_CATEGORIES.find((c) => c.slug === clean);
}

/** First matching storefront aisle for a catalog item (for PDP chrome / breadcrumbs). */
export function storefrontCategoryForItem(item: CatalogItem): StorefrontCategoryDef | undefined {
  // Skip the catch-all “collection” aisle so breadcrumbs stay specific.
  return STOREFRONT_CATEGORIES.find((c) => c.slug !== 'collection' && c.match(item));
}

export function filterByStorefrontCategory(
  items: CatalogItem[],
  slug: string
): CatalogItem[] {
  const def = storefrontCategoryBySlug(slug);
  if (!def) return items.filter((item) => !isBookItem(item));
  return items.filter(def.match);
}

/** Non-book catalog for mixed merchandising rails (Most loved, etc.). */
export function excludeBooks(items: CatalogItem[]): CatalogItem[] {
  return items.filter((item) => !isBookItem(item));
}

/**
 * Toy / play menorahs (Lego, plush, wood play, etc.) — keep out of “the collection”.
 */
export function isKidsMenorah(item: CatalogItem): boolean {
  if (!filterByStorefrontCategory([item], 'menorahs').length) return false;
  return /lego|play|plush|toy|stuff|craft/i.test(item.name);
}

export function collectionMenorahs(items: CatalogItem[]): CatalogItem[] {
  return filterByStorefrontCategory(items, 'menorahs').filter((item) => !isKidsMenorah(item));
}

export function kidsMenorahs(items: CatalogItem[]): CatalogItem[] {
  return filterByStorefrontCategory(items, 'menorahs').filter(isKidsMenorah);
}

/**
 * Craft / soft / blank dreidels for kids — keep out of “the collection”.
 * Airdry, blank, plush (and similar) land here; brass / slipcast / wood stay collection.
 */
export function isKidsDreidel(item: CatalogItem): boolean {
  if (!filterByStorefrontCategory([item], 'dreidels').length) return false;
  return /airdry|air.?dry|blank|plush|clay|toy|stuff|craft|play/i.test(item.name);
}

export function collectionDreidels(items: CatalogItem[]): CatalogItem[] {
  return filterByStorefrontCategory(items, 'dreidels').filter((item) => !isKidsDreidel(item));
}

export function kidsDreidels(items: CatalogItem[]): CatalogItem[] {
  return filterByStorefrontCategory(items, 'dreidels').filter(isKidsDreidel);
}

/**
 * Homepage rail from Airtable "Storefront rails".
 * Prefer curated picks (rank ascending); fall back to `fallback` when none selected yet.
 * `railAliases` also match (e.g. legacy `menorahs` → collection).
 */
export function itemsForStorefrontRail(
  items: CatalogItem[],
  rail: string,
  fallback: CatalogItem[],
  limit = 6,
  railAliases: string[] = []
): CatalogItem[] {
  const rails = new Set([rail, ...railAliases]);
  const curated = items
    .filter((item) => item.storefrontRails?.some((r) => rails.has(r)))
    .sort((a, b) => {
      const ar = a.storefrontRank ?? Number.POSITIVE_INFINITY;
      const br = b.storefrontRank ?? Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
  const source = curated.length ? curated : fallback;
  return source.slice(0, limit);
}
