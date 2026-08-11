import { catalogSlotId } from '../services/box/buildDefaultBox';
import type { BoxLineItem } from '../types/pilot';

export type PracticeGroupId = 'candles' | 'food' | 'story' | 'play' | 'keep';

export type PracticeGroup = {
  id: PracticeGroupId;
  title: string;
  tagline: string;
  description: string;
};

export const BOX_PRACTICE_GROUPS: PracticeGroup[] = [
  {
    id: 'candles',
    title: 'Light candles',
    tagline: 'One more each night — that counts.',
    description: 'Candles, lyric sheet, and parent guide for eight nights.',
  },
  {
    id: 'food',
    title: 'Eat latkes or sufganiyot',
    tagline: 'Fried food is the tradition.',
    description: 'Both treat paths ship in your base kit — swap recipes or media if you prefer.',
  },
  {
    id: 'story',
    title: 'Read together',
    tagline: 'Kid-sized, not a sermon.',
    description: 'A story pick matched to each child in your household.',
  },
  {
    id: 'play',
    title: 'Give & play',
    tagline: 'A simple game anyone can join.',
    description: 'Gelt, wrapping paper, and per-kid gift picks for play and surprise.',
  },
  {
    id: 'keep',
    title: 'Keep & store',
    tagline: 'Your collection grows each year.',
    description: 'Durable pieces for the storage box and binders shelved alongside it.',
  },
];

const SLOT_TO_GROUP: Record<string, PracticeGroupId> = {
  candles: 'candles',
  lyrics: 'candles',
  'parent-guide': 'candles',
  'extra-candles': 'candles',
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
  gelt: 'play',
  'gelt-small': 'play',
  'gelt-medium': 'play',
  'gelt-party': 'play',
  wrapping: 'play',
  'wrapping-paper': 'play',
  'pre-wrap': 'play',
  'wood-dreidel': 'play',
  'blank-dreidel': 'play',
  'airdry-dreidel': 'play',
  'extra-gelt': 'play',
  'storage-box': 'keep',
  'recipe-binder': 'keep',
  'keepsake-dreidel': 'keep',
  'family-hanukkiah': 'keep',
  'ala-dreidel': 'keep',
  'ala-hanukkiah': 'keep',
  decor: 'play',
};

export function practiceGroupForLineItem(li: BoxLineItem): PracticeGroupId {
  const base = catalogSlotId(li.slotId);
  if (base.startsWith('story')) return 'story';
  if (base.startsWith('gift')) return 'play';
  return SLOT_TO_GROUP[base] ?? 'keep';
}

export function groupLineItemsByPractice(lineItems: BoxLineItem[]): Record<PracticeGroupId, BoxLineItem[]> {
  const groups: Record<PracticeGroupId, BoxLineItem[]> = {
    candles: [],
    food: [],
    story: [],
    play: [],
    keep: [],
  };
  for (const li of lineItems) {
    if (li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-')) continue;
    const g = practiceGroupForLineItem(li);
    groups[g].push(li);
  }
  return groups;
}

export function inferKeepOrToss(slotId: string): 'keep' | 'toss' {
  const base = catalogSlotId(slotId);
  const keep = new Set([
    'storage-box',
    'recipe-binder',
    'keepsake-dreidel',
    'family-hanukkiah',
    'ala-dreidel',
    'ala-hanukkiah',
    'story',
    'gift',
  ]);
  if (base.startsWith('story') || base.startsWith('gift')) return 'keep';
  return keep.has(base) ? 'keep' : 'toss';
}

export function defaultIsSurprise(slotId: string): boolean {
  const base = catalogSlotId(slotId);
  return (
    base.startsWith('gift') ||
    base === 'gelt' ||
    base === 'gelt-small' ||
    base === 'gelt-medium' ||
    base === 'gelt-party'
  );
}
