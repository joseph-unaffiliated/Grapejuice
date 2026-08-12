import type { CatalogItem } from '../types/pilot';
import { getCurationTags } from './catalogCuration';

export type StorefrontCategoryDef = {
  slug: string;
  label: string;
  title: string;
  description: string;
  match: (item: CatalogItem) => boolean;
  /** Pill treatment in the dark category nav bar. */
  navStyle?: 'default' | 'sale';
  /** Render a `|` separator immediately before this pill. */
  separatorBefore?: boolean;
};

/** Legacy aisle slugs → current storefront category. */
const STOREFRONT_CATEGORY_ALIASES: Record<string, string> = {
  decor: 'other',
  gifts: 'other',
};

/**
 * Airtable Full Catalog `Category` multi-select values (plus synthetic nav labels).
 * Choice order from Airtable; “On Sale” is always last in nav.
 */
export const AIRTABLE_CATEGORY_NAMES = [
  'Menorah',
  'Dreidel',
  'Candles',
  'Book',
  'Activity',
  'Food',
  'Other',
  'Stuffies',
  'Gelt',
  'Toys',
  'On Sale',
] as const;

/** All Airtable Category values on an item (multi-select aware). */
export function catalogCategories(item: CatalogItem): string[] {
  if (item.categories?.length) return item.categories;
  if (item.category) return [item.category];
  return [];
}

export function itemHasCategory(item: CatalogItem, name: string): boolean {
  const target = name.trim().toLowerCase();
  return catalogCategories(item).some((c) => c.trim().toLowerCase() === target);
}

/** Books stay identifiable for rails / excludeBooks even without a Category tag. */
export function isBookItem(item: CatalogItem): boolean {
  if (itemHasCategory(item, 'Book')) return true;
  if (item.id.startsWith('book-')) return true;
  if (/book|novel/i.test(item.name)) return true;
  return false;
}

export function isFoodItem(item: CatalogItem): boolean {
  if (itemHasCategory(item, 'Food')) return true;
  // Gelt is its own aisle — don't pull gelt-named SKUs into Food via name alone.
  return /latke|sufgan|cookie.?cutter|applesauce|donut|napkin/i.test(item.name);
}

function matchByCategory(
  airtableName: string,
  extras?: (item: CatalogItem) => boolean
): (item: CatalogItem) => boolean {
  return (item) => itemHasCategory(item, airtableName) || Boolean(extras?.(item));
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
    match: matchByCategory(
      'Menorah',
      (item) =>
        getCurationTags(item).includes('hanukkiah') || /menorah|hanukkiah/i.test(item.name)
    ),
  },
  {
    slug: 'candles',
    label: 'Candles',
    title: 'Candles',
    description: 'Wax and light for eight nights.',
    match: matchByCategory('Candles', (item) => /candle/i.test(item.name)),
  },
  {
    slug: 'dreidels',
    label: 'Dreidels',
    title: 'Dreidels',
    description: 'Spin, play, and pass them down.',
    match: matchByCategory(
      'Dreidel',
      (item) => getCurationTags(item).includes('dreidel') || /dreidel/i.test(item.name)
    ),
  },
  {
    slug: 'gelt',
    label: 'Gelt',
    title: 'Gelt',
    description: 'Chocolate coins for the dreidel pot and beyond.',
    match: matchByCategory('Gelt', (item) => /gelt/i.test(item.name)),
  },
  {
    slug: 'food',
    label: 'Food',
    title: 'Food',
    description: 'Latkes, sufganiyot, napkins, and soft treats.',
    match: isFoodItem,
  },
  {
    slug: 'activity',
    label: 'Activities',
    title: 'Activities',
    description: 'Things to make, play, and do together.',
    match: matchByCategory('Activity'),
  },
  {
    slug: 'toys',
    label: 'Toys',
    title: 'Toys',
    description: 'Play pieces for little hands.',
    match: matchByCategory('Toys'),
  },
  {
    slug: 'stuffies',
    label: 'Stuffies',
    title: 'Stuffies',
    description: 'Soft companions for the holiday.',
    match: matchByCategory('Stuffies', (item) => /plush|stuff/i.test(item.name)),
  },
  {
    slug: 'books',
    label: 'Books',
    title: 'Books',
    description: 'Stories for the couch and the kids’ room.',
    match: isBookItem,
  },
  {
    slug: 'other',
    label: 'Other',
    title: 'Other',
    description: 'Everything else that doesn’t sit in a single aisle.',
    match: matchByCategory('Other'),
  },
  {
    slug: 'on-sale',
    label: 'On Sale',
    title: 'On Sale',
    description: 'Marked-down finds from across the catalog.',
    match: matchByCategory('On Sale'),
    navStyle: 'sale',
    separatorBefore: true,
  },
];

export const DEFAULT_STOREFRONT_CATEGORY = 'menorahs';

/** Canonical storefront aisle slug (applies legacy aliases like `gifts` → `other`). */
export function resolveStorefrontCategorySlug(slug: string): string {
  const clean = slug.trim().toLowerCase();
  return STOREFRONT_CATEGORY_ALIASES[clean] ?? clean;
}

export function storefrontCategoryBySlug(slug: string): StorefrontCategoryDef | undefined {
  const resolved = resolveStorefrontCategorySlug(slug);
  return STOREFRONT_CATEGORIES.find((c) => c.slug === resolved);
}

/**
 * Primary storefront aisle for a catalog item (PDP chrome / breadcrumbs).
 * Prefers a concrete aisle over the catch-all “All” and “On Sale”.
 */
export function storefrontCategoryForItem(item: CatalogItem): StorefrontCategoryDef | undefined {
  const concrete = STOREFRONT_CATEGORIES.find(
    (c) => c.slug !== 'collection' && c.slug !== 'on-sale' && c.match(item)
  );
  if (concrete) return concrete;
  return STOREFRONT_CATEGORIES.find((c) => c.slug === 'on-sale' && c.match(item));
}

/**
 * Filter catalog to an aisle. Multi-category items appear in every matching aisle
 * (each category’s `match` is independent — no first-only exclusion).
 */
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
