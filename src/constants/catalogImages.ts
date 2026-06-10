import type { ImageSourcePropType } from 'react-native';

/** Bundled catalog product photos — synced from Figma file rGzXYb1rNVxqGHz81835Jn */
export const CATALOG_IMAGES: Record<string, number> = {
  'audio-story-card': require('../../assets/catalog/audio-story-card.png'),
  'baby-safe-dreidel': require('../../assets/catalog/baby-safe-dreidel.png'),
  'board-book-hanukkah': require('../../assets/catalog/board-book-hanukkah.png'),
  'candles-44-pack': require('../../assets/catalog/candles-44-pack.png'),
  'child-hanukkiah-electric': require('../../assets/catalog/child-hanukkiah-electric.png'),
  'child-hanukkiah-keepsake': require('../../assets/catalog/child-hanukkiah-keepsake.png'),
  'cocktail-napkins-party': require('../../assets/catalog/cocktail-napkins-party.png'),
  'coloring-activity': require('../../assets/catalog/coloring-activity.png'),
  'display-runner-cloth': require('../../assets/catalog/display-runner-cloth.png'),
  'english-hebrew-dreidel': require('../../assets/catalog/english-hebrew-dreidel.png'),
  'family-hanukkiah-keepsake': require('../../assets/catalog/family-hanukkiah-keepsake.png'),
  'gelt-standard': require('../../assets/catalog/gelt-standard.png'),
  'graphic-novel-hanukkah': require('../../assets/catalog/graphic-novel-hanukkah.png'),
  'hanukkah-banner-garland': require('../../assets/catalog/hanukkah-banner-garland.png'),
  'hanukkah-blanket': require('../../assets/catalog/hanukkah-blanket.png'),
  'hanukkiah-craft-kit': require('../../assets/catalog/hanukkiah-craft-kit.png'),
  'keepsake-dreidel': require('../../assets/catalog/keepsake-dreidel.png'),
  'latke-mix': require('../../assets/catalog/latke-mix.png'),
  'lyric-sheet': require('../../assets/catalog/lyric-sheet.png'),
  'parent-guide-beginners': require('../../assets/catalog/parent-guide-beginners.png'),
  'pet-gift-hanukkah': require('../../assets/catalog/pet-gift-hanukkah.png'),
  'picture-book-hanukkah': require('../../assets/catalog/picture-book-hanukkah.png'),
  'plush-dreidel': require('../../assets/catalog/plush-dreidel.png'),
  'pyjamas-hanukkah': require('../../assets/catalog/pyjamas-hanukkah.png'),
  'recipe-card-binder': require('../../assets/catalog/recipe-card-binder.png'),
  'storage-box-annual': require('../../assets/catalog/storage-box-annual.png'),
  'sufganiyot-kit': require('../../assets/catalog/sufganiyot-kit.png'),
  'wrap-variety-pack': require('../../assets/catalog/wrap-variety-pack.png'),
};

export const HERO_COLLAGE_START = require('../../assets/home/hero-stacked-cards.png');

export function resolveCatalogImage(
  itemId?: string | null,
  imageUrl?: string | null
): ImageSourcePropType | null {
  if (itemId && CATALOG_IMAGES[itemId]) {
    return CATALOG_IMAGES[itemId];
  }
  if (imageUrl) {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/')) {
      return { uri: imageUrl };
    }
  }
  return null;
}
