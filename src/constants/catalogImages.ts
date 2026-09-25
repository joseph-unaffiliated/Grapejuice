import type { ImageSourcePropType } from 'react-native';

/** Bundled catalog product photos — synced from Figma file rGzXYb1rNVxqGHz81835Jn */
export const CATALOG_IMAGES: Record<string, number> = {
  'audio-story-card': require('../../assets/catalog/audio-story-card.webp'),
  'baby-safe-dreidel': require('../../assets/catalog/baby-safe-dreidel.webp'),
  'board-book-hanukkah': require('../../assets/catalog/board-book-hanukkah.webp'),
  'candles-44-pack': require('../../assets/catalog/candles-44-pack.webp'),
  'child-hanukkiah-electric': require('../../assets/catalog/child-hanukkiah-electric.webp'),
  'child-hanukkiah-keepsake': require('../../assets/catalog/child-hanukkiah-keepsake.webp'),
  'cocktail-napkins-party': require('../../assets/catalog/cocktail-napkins-party.webp'),
  'coloring-activity': require('../../assets/catalog/coloring-activity.webp'),
  'display-runner-cloth': require('../../assets/catalog/display-runner-cloth.webp'),
  'english-hebrew-dreidel': require('../../assets/catalog/english-hebrew-dreidel.webp'),
  'family-hanukkiah-keepsake': require('../../assets/catalog/family-hanukkiah-keepsake.webp'),
  'gelt-standard': require('../../assets/catalog/gelt-standard.webp'),
  'graphic-novel-hanukkah': require('../../assets/catalog/graphic-novel-hanukkah.webp'),
  'hanukkah-banner-garland': require('../../assets/catalog/hanukkah-banner-garland.webp'),
  'hanukkah-blanket': require('../../assets/catalog/hanukkah-blanket.webp'),
  'hanukkiah-craft-kit': require('../../assets/catalog/hanukkiah-craft-kit.webp'),
  'keepsake-dreidel': require('../../assets/catalog/keepsake-dreidel.webp'),
  'latke-mix': require('../../assets/catalog/latke-mix.webp'),
  'lyric-sheet': require('../../assets/catalog/lyric-sheet.webp'),
  'parent-guide-beginners': require('../../assets/catalog/parent-guide-beginners.webp'),
  'pet-gift-hanukkah': require('../../assets/catalog/pet-gift-hanukkah.webp'),
  'picture-book-hanukkah': require('../../assets/catalog/picture-book-hanukkah.webp'),
  'plush-dreidel': require('../../assets/catalog/plush-dreidel.webp'),
  'pyjamas-hanukkah': require('../../assets/catalog/pyjamas-hanukkah.webp'),
  'recipe-card-binder': require('../../assets/catalog/recipe-card-binder.webp'),
  'storage-box-annual': require('../../assets/catalog/storage-box-annual.webp'),
  'sufganiyot-kit': require('../../assets/catalog/sufganiyot-kit.webp'),
  'wrap-variety-pack': require('../../assets/catalog/wrap-variety-pack.webp'),
};

export const HERO_COLLAGE_START = require('../../assets/home/hero-stacked-cards.png');

export function resolveCatalogImage(
  itemId?: string | null,
  imageUrl?: string | null
): ImageSourcePropType | null {
  // Prefer remote (Airtable → Storage sync) over legacy bundled placeholders.
  if (imageUrl) {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/')) {
      return { uri: imageUrl };
    }
  }
  if (itemId && CATALOG_IMAGES[itemId]) {
    return CATALOG_IMAGES[itemId];
  }
  return null;
}
