import type { CatalogItem } from '../types/pilot';
import {
  isDreidelCookieCutter,
  storefrontCategoryForItem,
} from './storefrontCategories';

export type PdpHowToLink = {
  kind: 'play-dreidel' | 'light-candles';
  label: string;
};

/**
 * Which how-to page (if any) a PDP should link to.
 * Menorahs + Candles → light; playable dreidels → play.
 */
export function howToLinkForItem(item: CatalogItem): PdpHowToLink | null {
  const aisle = storefrontCategoryForItem(item)?.slug;
  if (aisle === 'menorahs' || aisle === 'candles') {
    return { kind: 'light-candles', label: 'How to light the hanukkiah' };
  }
  if (aisle === 'dreidels' && !isDreidelCookieCutter(item)) {
    return { kind: 'play-dreidel', label: 'How to play dreidel' };
  }
  return null;
}
