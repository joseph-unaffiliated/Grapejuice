import { catalogSlotId } from '../services/box/buildDefaultBox';
import type { BoxLineItem, CatalogItem } from '../types/pilot';

/** Figma 370:3514 — five scroll sections on Your Hanukkah Box. */
export type BoxDisplaySectionId = 'candles' | 'dreidel' | 'food' | 'story' | 'presents';

export type BoxDisplaySection = {
  id: BoxDisplaySectionId;
  navLabel: string;
  title: string;
  description: string;
};

/** Display order: Story before Presents. Multi-paragraph tradition blurbs (no “we picked…”). */
export const BOX_DISPLAY_SECTIONS: BoxDisplaySection[] = [
  {
    id: 'candles',
    navLabel: 'Light the Candles',
    title: 'Light the Candles',
    description:
      'Each night of Hanukkah, families light the hanukkiah — one more candle than the night before — to remember the miracle of the oil that lasted eight nights.\n\nThe shamash (helper candle) lights the others. Some families say the blessings first; others light, then bless. Either way, the glow grows night by night.',
  },
  {
    id: 'dreidel',
    navLabel: 'Play Dreidel',
    title: 'Play Dreidel',
    description:
      'Spin the dreidel and play for gelt — a classic Hanukkah game for the whole table.\n\nNun, gimel, hey, shin: each letter decides whether you take, give, or sit out. Chocolate coins keep the pot friendly for mixed-age crowds.',
  },
  {
    id: 'food',
    navLabel: 'Eat & Drink',
    title: 'Eat Latkes and Sufganiyot',
    description:
      'Fried foods are a Hanukkah tradition — oil again, echoing the miracle. Latkes, sufganiyot, and the recipes to make them turn the kitchen into part of the holiday.\n\nApplesauce, sour cream, or powdered sugar: pick your camp and pass the platter.',
  },
  {
    id: 'story',
    navLabel: 'Tell the Story',
    title: 'Tell the Story',
    description:
      'Tell the story of the Maccabees and the miracle of the oil — books to read together each night.\n\nSome families read a little every evening; others save the big picture book for the first night. The point is the same: remember why the lights matter.',
  },
  {
    id: 'presents',
    navLabel: 'Give Presents',
    title: 'Give Presents',
    description:
      'Giving is part of the holiday — wrap gifts and share something special.\n\nFull gift cards live with their practices above (a dreidel present under Play Dreidel, and so on). Here you see what is wrappable and choose paper or pre-wrap.',
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
  'gelt-small': 'dreidel',
  'gelt-medium': 'dreidel',
  'gelt-party': 'dreidel',
  'extra-gelt': 'dreidel',
  'wood-dreidel': 'dreidel',
  'blank-dreidel': 'dreidel',
  'airdry-dreidel': 'dreidel',
  'keepsake-dreidel': 'dreidel',
  'ala-dreidel': 'dreidel',
  'latke-kit': 'food',
  'latke-mix': 'food',
  'latke-recipe-media': 'food',
  'latke-recipe-printed': 'food',
  'sufganiyot-kit': 'food',
  'sufganiyot-mix': 'food',
  applesauce: 'food',
  'sufganiyot-recipe-media': 'food',
  'sufganiyot-recipe-printed': 'food',
  playlist: 'food',
  wrapping: 'presents',
  'wrapping-paper': 'presents',
  'pre-wrap': 'presents',
  'storage-box': 'presents',
  'recipe-binder': 'presents',
  decor: 'presents',
  'hanukkah-blanket': 'presents',
  'pyjamas-hanukkah': 'presents',
  'hanukkah-banner-garland': 'presents',
  'cocktail-napkins-party': 'food',
  'cookie-cutters': 'food',
  'hanukkah-cookie-cutters': 'food',
  'display-runner-cloth': 'presents',
  'pet-gift-hanukkah': 'presents',
};

/** Prefer natural practice homes for gift SKUs (never dump solely because slot is gift-*). */
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

const BOX_SECTION_LABEL_TO_ID: Record<string, BoxDisplaySectionId> = {
  candles: 'candles',
  'light the candles': 'candles',
  menorahs: 'candles',
  hanukkiah: 'candles',
  dreidel: 'dreidel',
  'play dreidel': 'dreidel',
  'spin the dreidel': 'dreidel',
  food: 'food',
  'eat & drink': 'food',
  'eat and drink': 'food',
  story: 'story',
  'tell the story': 'story',
  books: 'story',
  presents: 'presents',
  'give presents': 'presents',
  gifts: 'presents',
};

function sectionFromBoxSections(boxSections?: string[]): BoxDisplaySectionId | null {
  if (!boxSections?.length) return null;
  for (const raw of boxSections) {
    const key = raw.trim().toLowerCase();
    const hit = BOX_SECTION_LABEL_TO_ID[key];
    if (hit) return hit;
  }
  return null;
}

/** Infer practice section from catalog facts when gift-* would otherwise land in Presents. */
export function inferDisplaySectionForCatalogItem(item: CatalogItem): BoxDisplaySectionId {
  if (GIFT_ITEM_SECTION[item.id]) return GIFT_ITEM_SECTION[item.id];
  const fromAirtable = sectionFromBoxSections(item.boxSections);
  if (fromAirtable) return fromAirtable;

  const base = catalogSlotId(item.slotId);
  if (SLOT_TO_DISPLAY[base]) return SLOT_TO_DISPLAY[base];
  if (base.startsWith('story')) return 'story';

  const hay = `${item.id} ${item.name} ${item.category ?? ''}`.toLowerCase();
  if (/book|story|maccabee/.test(hay) || item.category === 'Book') return 'story';
  if (/dreidel|gelt/.test(hay) || item.category === 'Dreidel') return 'dreidel';
  if (/menorah|hanukkiah|candle/.test(hay) || item.category === 'Menorah' || item.category === 'Candles') {
    return 'candles';
  }
  if (/latke|sufgan|applesauce|napkin|cookie.?cutter|food|donut/.test(hay) || item.category === 'Food') return 'food';
  if (/wrap|paper|pre.?wrap/.test(hay)) return 'presents';
  return 'presents';
}

export function displaySectionForLineItem(
  li: BoxLineItem,
  item?: CatalogItem | null
): BoxDisplaySectionId {
  if (GIFT_ITEM_SECTION[li.itemId]) return GIFT_ITEM_SECTION[li.itemId];
  if (item) {
    const fromItem = sectionFromBoxSections(item.boxSections);
    if (fromItem) return fromItem;
  }

  const base = catalogSlotId(li.slotId);
  if (base.startsWith('story')) return 'story';

  // Gift lines: place by catalog identity, not by gift-* slot alone.
  if (base === 'gift' || li.slotId.startsWith('gift-')) {
    if (item) return inferDisplaySectionForCatalogItem(item);
    return GIFT_ITEM_SECTION[li.itemId] ?? 'presents';
  }

  if (SLOT_TO_DISPLAY[base]) return SLOT_TO_DISPLAY[base];
  if (item) return inferDisplaySectionForCatalogItem(item);
  return 'presents';
}

export function displaySectionForCatalogItem(item: CatalogItem): BoxDisplaySectionId {
  return inferDisplaySectionForCatalogItem(item);
}

export function groupLineItemsByDisplaySection(
  lineItems: BoxLineItem[],
  catalog?: CatalogItem[]
): Record<BoxDisplaySectionId, BoxLineItem[]> {
  const groups: Record<BoxDisplaySectionId, BoxLineItem[]> = {
    candles: [],
    dreidel: [],
    food: [],
    story: [],
    presents: [],
  };
  for (const li of lineItems) {
    if (li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-')) continue;
    const item = catalog?.find((c) => c.id === li.itemId);
    groups[displaySectionForLineItem(li, item)].push(li);
  }
  return groups;
}

/** Section tabs / scroll targets — only sections that have line items in the box. */
export function nonEmptyDisplaySectionIds(
  grouped: Record<BoxDisplaySectionId, BoxLineItem[]>,
  candidates: readonly BoxDisplaySectionId[] = BOX_DISPLAY_SECTIONS.map((s) => s.id),
  /** Always show Presents when the box has wrappable or wrap-control lines elsewhere. */
  forceInclude?: BoxDisplaySectionId[]
): BoxDisplaySectionId[] {
  const base = candidates.filter((id) => grouped[id].length > 0);
  if (!forceInclude?.length) return base;
  const set = new Set(base);
  for (const id of forceInclude) {
    if (candidates.includes(id)) set.add(id);
  }
  return candidates.filter((id) => set.has(id));
}
