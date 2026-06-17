import { catalogSlotId } from '../services/box/buildDefaultBox';
import type { BoxLineItem, CatalogItem } from '../types/pilot';

/** Figma 370:3514 — five scroll sections on Your Hanukkah Box. */
export type BoxDisplaySectionId = 'candles' | 'dreidel' | 'food' | 'presents' | 'story';

export type BoxDisplaySection = {
  id: BoxDisplaySectionId;
  navLabel: string;
  title: string;
  description: string;
  browseChips: string[];
};

export const BOX_DISPLAY_SECTIONS: BoxDisplaySection[] = [
  {
    id: 'candles',
    navLabel: 'Candles',
    title: 'Light the Candles',
    description:
      'Hanukkah is a tradition of lighting candles, singing songs, and telling the story of the Maccabees — we picked candles, lyrics, and hanukkiahs for your family.',
    browseChips: ['browse hanukkiahs', 'browse fancy candles', 'browse toys & crafts'],
  },
  {
    id: 'dreidel',
    navLabel: 'Dreidel',
    title: 'Spin the Dreidel',
    description: 'Gelt, dreidels, and a quick how-to for game night.',
    browseChips: ['browse dreidels', 'browse fancy gelt'],
  },
  {
    id: 'food',
    navLabel: 'Food',
    title: 'Eat Latkes and Sufganiyot',
    description: 'Fried treats and recipe cards — pick your path.',
    browseChips: ['browse all foods', 'browse drinks'],
  },
  {
    id: 'presents',
    navLabel: 'Presents',
    title: 'Give Presents',
    description: 'Wrapping paper and cozy add-ons — heirloom gifts via browse chips.',
    browseChips: ['choose a wrapping paper', 'hanukkah style gifts'],
  },
  {
    id: 'story',
    navLabel: 'Story',
    title: 'Tell the Story',
    description: 'Age-matched books to read together each night.',
    browseChips: ['browse story books', 'tell the story of the Maccabees'],
  },
];

const SLOT_TO_DISPLAY: Record<string, BoxDisplaySectionId> = {
  candles: 'candles',
  lyrics: 'candles',
  'parent-guide': 'candles',
  'parent-discussion': 'candles',
  'parent-words': 'candles',
  'extra-candles': 'candles',
  'hanukkiah-craft-kit': 'candles',
  'child-hanukkiah-electric': 'candles',
  'child-hanukkiah-keepsake': 'candles',
  'family-hanukkiah': 'candles',
  'ala-hanukkiah': 'candles',
  gelt: 'dreidel',
  'extra-gelt': 'dreidel',
  'keepsake-dreidel': 'dreidel',
  'ala-dreidel': 'dreidel',
  'latke-kit': 'food',
  'latke-recipe-media': 'food',
  'latke-recipe-printed': 'food',
  'sufganiyot-kit': 'food',
  'sufganiyot-recipe-media': 'food',
  'sufganiyot-recipe-printed': 'food',
  playlist: 'food',
  wrapping: 'presents',
  'storage-box': 'presents',
  'recipe-binder': 'presents',
  decor: 'presents',
  'hanukkah-blanket': 'presents',
  'pyjamas-hanukkah': 'presents',
  'hanukkah-banner-garland': 'presents',
  'cocktail-napkins-party': 'presents',
  'display-runner-cloth': 'presents',
  'pet-gift-hanukkah': 'presents',
};

const GIFT_ITEM_SECTION: Record<string, BoxDisplaySectionId> = {
  'plush-dreidel': 'dreidel',
  'baby-safe-dreidel': 'dreidel',
  'english-hebrew-dreidel': 'dreidel',
  'memory-card-first-hanukkah': 'dreidel',
  'hanukkiah-craft-kit': 'candles',
  'child-hanukkiah-electric': 'candles',
  'child-hanukkiah-keepsake': 'candles',
  'hanukkah-blanket': 'presents',
  'pyjamas-hanukkah': 'presents',
  'tzedakah-donation-card': 'presents',
};

export function displaySectionForLineItem(li: BoxLineItem): BoxDisplaySectionId {
  if (GIFT_ITEM_SECTION[li.itemId]) return GIFT_ITEM_SECTION[li.itemId];
  const base = catalogSlotId(li.slotId);
  if (base.startsWith('story')) return 'story';
  if (base.startsWith('gift')) return 'presents';
  return SLOT_TO_DISPLAY[base] ?? 'presents';
}

export function displaySectionForCatalogItem(item: CatalogItem): BoxDisplaySectionId {
  return displaySectionForLineItem({
    slotId: item.slotId,
    itemId: item.id,
    quantity: 1,
    unitCents: 0,
    label: item.name,
  });
}

export function groupLineItemsByDisplaySection(
  lineItems: BoxLineItem[]
): Record<BoxDisplaySectionId, BoxLineItem[]> {
  const groups: Record<BoxDisplaySectionId, BoxLineItem[]> = {
    candles: [],
    dreidel: [],
    food: [],
    presents: [],
    story: [],
  };
  for (const li of lineItems) {
    if (li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-')) continue;
    groups[displaySectionForLineItem(li)].push(li);
  }
  return groups;
}
