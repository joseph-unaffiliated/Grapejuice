/**
 * Photo rule for the phone layouts: main product photos (grey background, `imageUrl` /
 * `imageUrls[0]`) for tiles and thumbnails; secondary photos (`imageUrls[1..]`) only for
 * heroes and large cards. Never mixed in one row.
 */
import type { CatalogItem } from '../../types/pilot';

export function byId(items: CatalogItem[]): Map<string, CatalogItem> {
  return new Map(items.map((it) => [it.id, it]));
}

/** The main product photo (thumb when available). */
export function primaryPhoto(item: CatalogItem | undefined | null, thumb = true): string | null {
  if (!item) return null;
  if (thumb && item.imageThumbUrls?.[0]) return item.imageThumbUrls[0];
  return item.imageUrl ?? item.imageUrls?.[0] ?? null;
}

/** The n-th secondary photo (0-based), full size for heroes. */
export function secondaryPhoto(item: CatalogItem | undefined | null, n = 0): string | null {
  if (!item) return null;
  return item.imageUrls?.[n + 1] ?? null;
}

/** Secondary photos the homepage and menu use, by catalog id and gallery index. */
export const HOME_PHOTOS = {
  mosaicLatkes: ['latke-kit', 1],
  mosaicDrawing: ['draw-your-own-dreidel', 0],
  mosaicGimmel: ['gimmel-the-dreidel-stuffie', 0],
  practiceCandles: ['roll-your-own-beeswax-candles', 0],
  practiceDreidel: ['draw-your-own-dreidel', 0],
  practiceEat: ['latke-kit', 1],
  practiceStory: ['book-a-dragon-for-hanukkah', 0],
  practiceGifts: ['shamash-the-menorah-stuffie', 1],
  catMenorahs: ['stemless-menorah', 0],
  catStuffies: ['shamash-the-menorah-stuffie', 0],
  catActivities: ['airdry-clay-dreidel', 0],
  catCandles: ['beeswax-candles', 0],
  catDreidels: ['solid-brass-dreidel', 1],
  catFood: ['dreidel-cookie-cutters', 0],
  candlesHero: ['welcome-menorah', 0],
  dreidelHero: ['draw-your-own-dreidel', 0],
  closedHero: ['stemless-menorah', 0],
  recipientHero: ['welcome-menorah', 2],
} as const satisfies Record<string, readonly [string, number]>;

export function homePhoto(items: Map<string, CatalogItem>, key: keyof typeof HOME_PHOTOS): string | null {
  const [id, n] = HOME_PHOTOS[key];
  return secondaryPhoto(items.get(id), n);
}

/** The six thumbnails that stand for "a Hanukkah box" when there's no real box yet. */
export const SAMPLE_BOX_IDS = ['beeswax-candles', 'classic-wooden-dreidel', 'big-bag-of-gelt', 'latke-kit', 'book-a-dragon-for-hanukkah', 'shamash-the-menorah-stuffie'];

export const TOP_PICK_IDS = ['lego-menorah', 'shamash-the-menorah-stuffie', 'arch-menorah', 'jelly-the-sufganiyah-stuffie', 'solid-brass-dreidel'];
