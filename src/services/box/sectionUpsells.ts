/**
 * Resolve addable browse/upsell catalog rows for a My Box practice section.
 * Prefer swappable targets (also addable) first, then explicit upsells; fill from section catalog.
 */

import {
  SECTION_RULES,
  type BoxSectionId,
  type DefaultSlotId,
  type GiftKindId,
  resolveByDefaultSlot,
  resolveGiftKind,
} from './boxRules';
import {
  displaySectionForCatalogItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import type { CatalogItem } from '../../types/pilot';

const DEFAULT_SLOTS = new Set<string>([
  'candles',
  'wood-dreidel',
  'blank-dreidel',
  'airdry-dreidel',
  'gelt-small',
  'gelt-medium',
  'gelt-party',
  'latke-mix',
  'sufganiyot-mix',
  'applesauce',
  'wrapping-paper',
  'pre-wrap',
]);

const GIFT_KINDS = new Set<string>([
  'stuffie',
  'wood-toy-menorah',
  'airdry',
  'blank',
  'lego-menorah',
  'diy-candles',
  'extra-book',
]);

/** Free-text upsell/swap kinds → name/id/slot patterns. */
const KIND_PATTERNS: Record<string, RegExp[]> = {
  menorah: [/menorah|hanukkiah/i],
  'extra-candles': [/extra.?candle|candle.*extra|candles$/i],
  'toy-menorahs': [/toy.*menorah|menorah.*toy|lego.*menorah|play.?menorah|wood.*menorah/i],
  'toy-menorah': [/toy.*menorah|menorah.*toy|lego.*menorah|play.?menorah/i],
  'dreidel-stuffie': [/dreidel.*(stuffie|plush)|plush.*dreidel|stuffie.*dreidel/i],
  'brass-dreidel': [/brass.*dreidel|dreidel.*brass/i],
  'slipcast-dreidel': [/slip.?cast|ceramic.*dreidel|dreidel.*ceramic/i],
  'more-dreidels': [/dreidel/i],
  'electric-candles': [/electric.*candle|candle.*electric/i],
  'cookie-cutters': [/cookie.?cutter/i],
  napkins: [/napkin/i],
  'latke-stuffie': [/latke.*(stuffie|plush)|plush.*latke|^latke,\s*the\s*latke\s*stuffie/i],
  'sufganiya-stuffie': [
    /sufgan.*(stuffie|plush)|plush.*sufgan|donut.*plush|jelly,\s*the\s*sufganiyah\s*stuffie/i,
  ],
  'menorah-stuffie': [/menorah.*stuffie|shamash,\s*the\s*menorah\s*stuffie|plush.*menorah/i],
  'add-more-applesauce': [/applesauce|apple.?sauce/i],
  'more-gelt-small': [/gelt.*small|small.*gelt|little.?bag.*gelt|gelt.*little.?bag/i],
  'more-gelt-medium': [/gelt.*medium|medium.*gelt|big.?bag.*gelt|gelt.*big.?bag|^gelt$/i],
  'gelt-small×2': [/gelt.*small|small.*gelt|little.?bag.*gelt|gelt.*little.?bag/i],
  // Party gelt already matched via gelt.*party|party.*gelt in section graphs.
  'more-books': [/book|story/i],
  'any-book': [/book|story/i],
  'extra-book': [/book|story/i],
};

function haystack(item: CatalogItem): string {
  return `${item.id} ${item.name} ${item.slotId ?? ''} ${item.category ?? ''}`.toLowerCase();
}

function normalizeKind(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

function matchesKind(item: CatalogItem, kind: string): boolean {
  const key = normalizeKind(kind);
  if (key === 'donate') return false;
  if (DEFAULT_SLOTS.has(key)) {
    const hit = resolveByDefaultSlot([item], key as DefaultSlotId);
    return hit?.id === item.id;
  }
  if (GIFT_KINDS.has(key) || key === 'stuffie') {
    const giftKey = (
      key === 'airdry-dreidel' ? 'airdry' : key === 'blank-dreidel' ? 'blank' : key
    ) as GiftKindId;
    if (GIFT_KINDS.has(giftKey)) {
      const hit = resolveGiftKind([item], giftKey);
      return hit?.id === item.id;
    }
  }
  const patterns = KIND_PATTERNS[key];
  if (patterns?.length) {
    const h = haystack(item);
    return patterns.some((re) => re.test(h) || re.test(item.slotId ?? ''));
  }
  const token = key.replace(/×\d+$/, '');
  const h = haystack(item);
  return (
    item.id === token ||
    item.slotId === token ||
    item.defaultSlot === token ||
    h.includes(token.replace(/-/g, ' ')) ||
    h.includes(token)
  );
}

/**
 * Upsell rail kinds — order matters (first kinds lead the rail):
 * 1) Swappable targets (included + extra) so they appear as add-ons too, not only swaps
 * 2) Explicit upsells
 */
function collectUpsellKinds(sectionId: BoxSectionId): string[] {
  const section = SECTION_RULES.find((s) => s.id === sectionId);
  if (!section) return [];
  const kinds: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const k = normalizeKind(raw);
    if (k === 'donate' || seen.has(k)) return;
    // Books only surface under Tell the Story — not candles/dreidel/food/presents.
    if (sectionId !== 'story' && isBookUpsellOrSwapKind(raw)) return;
    seen.add(k);
    kinds.push(raw);
  };

  // Swaps first — available in Add more as add-ons (not swap-only).
  for (const slot of section.slots) {
    for (const s of slot.swaps) {
      if (s.price === 'donate') continue;
      push(s.targetSlotOrKind);
    }
  }

  for (const slot of section.slots) {
    for (const u of slot.upsells ?? []) {
      push(u.targetSlotOrKind);
    }
  }

  // Eat & Drink: keep napkins + cookie cutters even if a slot graph omits them.
  if (sectionId === 'food') {
    push('cookie-cutters');
    push('napkins');
  }

  return kinds;
}

function isBookishCatalogItem(item: CatalogItem): boolean {
  return (
    item.category === 'Book' ||
    item.slotId === 'story' ||
    (item.slotId ?? '').startsWith('story') ||
    /book|story/i.test(`${item.id} ${item.name} ${item.category ?? ''}`)
  );
}

/** Book-related boxRules kinds — only valid under Tell the Story. */
function isBookUpsellOrSwapKind(raw: string): boolean {
  const cleaned = raw.replace(/\([^)]*\)/g, ' ').replace(/—.*$/, ' ').trim();
  const k = normalizeKind(cleaned);
  if (!k || k === 'donate') return false;
  if (
    k === 'more-books' ||
    k === 'any-book' ||
    k === 'extra-book' ||
    k.startsWith('story-book') ||
    k === 'story' ||
    k.startsWith('story-')
  ) {
    return true;
  }
  return /\bbook/.test(k) && !/cookie|facebook|notebook/.test(k);
}

function excludeBooksUnlessStory(
  sectionId: BoxDisplaySectionId,
  items: CatalogItem[]
): CatalogItem[] {
  if (sectionId === 'story') return items;
  return items.filter((item) => !isBookishCatalogItem(item));
}

/** Menorah / dreidel — second tier in Presents Add more (books live under Story). */
function isMenorahOrDreidel(item: CatalogItem): boolean {
  if (isBookishCatalogItem(item)) return false;
  const hay = haystack(item);
  if (item.category === 'Menorah' || /menorah|hanukkiah/.test(hay)) return true;
  if (item.category === 'Dreidel' || /dreidel/.test(hay)) return true;
  return false;
}

/**
 * Presents Add more:
 * 0) wrapping paper (when restorable after pre-wrap)
 * 1) wrappable items that are not menorahs or dreidels
 * 2) then dreidels / menorahs (books only appear under Tell the Story)
 */
function isWrappingPaperCatalogItem(item: CatalogItem): boolean {
  const hay = haystack(item);
  if (item.defaultSlot === 'wrapping-paper' || item.slotId === 'wrapping-paper') return true;
  return /wrapping.?paper/i.test(hay);
}

function sortPresentsUpsells(items: CatalogItem[]): CatalogItem[] {
  const paper: CatalogItem[] = [];
  const primary: CatalogItem[] = [];
  const assortment: CatalogItem[] = [];
  for (const item of items) {
    if (isWrappingPaperCatalogItem(item)) paper.push(item);
    else if (isMenorahOrDreidel(item)) assortment.push(item);
    else primary.push(item);
  }
  return [...paper, ...primary, ...assortment];
}

function isWrappableCatalogAddOn(item: CatalogItem): boolean {
  if (isBookishCatalogItem(item)) return false;
  if (item.wrappable === true) return true;
  if (item.wrappable === false) return false;
  const hay = `${item.id} ${item.name} ${item.category ?? ''} ${item.slotId ?? ''}`.toLowerCase();
  if (/napkin|cookie.?cutter|gelt|latke|sufgan|applesauce|mix|wrapping|pre.?wrap/.test(hay)) {
    return false;
  }
  if (/dreidel|menorah|hanukkiah|plush|stuffie|toy|lego|blanket|pyjama|pajama|diy|craft/.test(hay)) {
    return true;
  }
  return false;
}

function isFoodUpsellCandidate(item: CatalogItem): boolean {
  const hay = `${item.id} ${item.name} ${item.category ?? ''} ${item.slotId ?? ''}`.toLowerCase();
  if (/napkin|cookie.?cutter|latke|sufgan|applesauce|mix|food|donut|plate/.test(hay)) return true;
  if (item.category === 'Food') return true;
  return displaySectionForCatalogItem(item) === 'food';
}

/**
 * A slot's default kind, but only when it maps to a concrete default-slot SKU
 * (e.g. `candles`, `wood-dreidel`, `latke-mix`) — not the per-kid `gift`/`story-book`
 * descriptors, which resolve through the gift/book flows instead.
 */
function concreteDefaultKind(slot: { defaultKind: string }): string | undefined {
  const cleaned = cleanKindLabel(slot.defaultKind);
  return DEFAULT_SLOTS.has(normalizeKind(cleaned)) ? cleaned : undefined;
}

/**
 * Swap shelf: `'included'` swaps only, plus each slot's own default so a swapped-away
 * default (e.g. beeswax candles, classic wooden dreidel) can always be restored.
 * `'extra'` targets (e.g. brass dreidel) are not true swaps — they're à la carte
 * add-ons purchased alongside the existing item, so they only surface via the
 * "Add more" upsell rail (`collectUpsellKinds`), not here.
 */
function collectSwapKinds(sectionId: BoxSectionId): string[] {
  const section = SECTION_RULES.find((s) => s.id === sectionId);
  if (!section) return [];
  const kinds: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const k = normalizeKind(raw);
    if (k === 'donate' || seen.has(k)) return;
    if (sectionId !== 'story' && isBookUpsellOrSwapKind(raw)) return;
    seen.add(k);
    kinds.push(raw);
  };
  // Slot defaults first, so restoring/adding the default leads the shelf and free rail.
  for (const slot of section.slots) {
    const dk = concreteDefaultKind(slot);
    if (dk) push(dk);
  }
  for (const slot of section.slots) {
    for (const s of slot.swaps) {
      if (s.price !== 'included') continue;
      push(s.targetSlotOrKind);
    }
  }
  return kinds;
}

function resolveKindsToCatalog(
  kinds: string[],
  catalog: CatalogItem[],
  exclude: ReadonlySet<string>,
  limit: number
): CatalogItem[] {
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  const push = (item: CatalogItem | undefined) => {
    if (!item || exclude.has(item.id) || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };

  for (const kind of kinds) {
    if (out.length >= limit) break;
    const key = normalizeKind(kind);
    if (DEFAULT_SLOTS.has(key)) {
      const row = resolveByDefaultSlot(catalog, key as DefaultSlotId);
      if (row) push(catalog.find((c) => c.id === row.id) ?? (row as CatalogItem));
      continue;
    }
    if (GIFT_KINDS.has(key)) {
      const row = resolveGiftKind(catalog, key as GiftKindId);
      if (row) push(catalog.find((c) => c.id === row.id) ?? (row as CatalogItem));
    }
    for (const item of catalog) {
      if (out.length >= limit) break;
      if (matchesKind(item, kind)) push(item);
    }
  }
  return out;
}

/**
 * Catalog items to show under a section as browse/upsell thumbnails.
 * Excludes SKUs already in the box; prefers swappable targets first, then
 * boxRules upsells, then section peers. Presents: wrappable catalog add-ons.
 * Books only appear under Tell the Story.
 */
export function resolveSectionUpsellItems(
  sectionId: BoxDisplaySectionId,
  catalog: CatalogItem[],
  excludeItemIds: ReadonlySet<string> | string[],
  limit = 8
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];
  const exclude = excludeItemIds instanceof Set ? excludeItemIds : new Set(excludeItemIds);

  // Give Presents Add more: wrapping paper first (restore after pre-wrap), then
  // wrapping-eligible catalog items not already in the box.
  if (sectionId === 'presents') {
    const out: CatalogItem[] = [];
    const seen = new Set<string>();
    const push = (item: CatalogItem | undefined) => {
      if (!item || exclude.has(item.id) || seen.has(item.id)) return;
      seen.add(item.id);
      out.push(item);
    };

    const paperRow = resolveByDefaultSlot(catalog, 'wrapping-paper');
    push(
      (paperRow ? catalog.find((c) => c.id === paperRow.id) : undefined) ??
        catalog.find((c) => isWrappingPaperCatalogItem(c))
    );
    for (const item of catalog) {
      if (isWrappingPaperCatalogItem(item)) {
        push(item);
        continue;
      }
      if (!isWrappableCatalogAddOn(item)) continue;
      push(item);
    }
    return sortPresentsUpsells(out).slice(0, limit);
  }

  const kinds = collectUpsellKinds(sectionId);
  const out = excludeBooksUnlessStory(
    sectionId,
    resolveKindsToCatalog(kinds, catalog, exclude, limit)
  );
  const seen = new Set(out.map((i) => i.id));

  if (out.length < limit) {
    for (const item of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(item.id) || seen.has(item.id)) continue;
      if (displaySectionForCatalogItem(item) !== sectionId) continue;
      if (sectionId !== 'story' && isBookishCatalogItem(item)) continue;
      if (sectionId === 'food' && !isFoodUpsellCandidate(item)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }

  // Story: keep books in natural kind order. Other sections should have none.
  if (sectionId === 'story') return out.slice(0, limit);
  return excludeBooksUnlessStory(sectionId, out).slice(0, limit);
}

/**
 * Swap alternatives for a section from boxRules (when catalog.swapOptions is empty).
 * Fills with same-section peers so Swap still appears when specific kinds are missing.
 * Books only appear under Tell the Story.
 */
export function resolveSectionSwapItems(
  sectionId: BoxDisplaySectionId,
  catalog: CatalogItem[],
  currentItemId: string,
  limit = 6
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];
  const exclude = new Set([currentItemId]);
  const kinds = collectSwapKinds(sectionId);
  const out = excludeBooksUnlessStory(
    sectionId,
    resolveKindsToCatalog(kinds, catalog, exclude, limit)
  );
  const seen = new Set(out.map((i) => i.id));

  if (out.length < limit) {
    for (const item of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(item.id) || seen.has(item.id)) continue;
      if (displaySectionForCatalogItem(item) !== sectionId) continue;
      if (sectionId !== 'story' && isBookishCatalogItem(item)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }

  return excludeBooksUnlessStory(sectionId, out).slice(0, limit);
}

/**
 * Strictly `'included'`-policy items for a section — used for the "empty section"
 * placeholder ("add any of these at no extra cost"). Unlike `resolveSectionSwapItems`,
 * this never pads with arbitrary same-section peers, so a priced item never ends up
 * surfaced under a "free" label just because the documented graph ran short.
 */
export function resolveFreeSlotAddOptions(
  sectionId: BoxDisplaySectionId,
  catalog: CatalogItem[],
  limit = 8
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];
  const kinds = collectSwapKinds(sectionId);
  return excludeBooksUnlessStory(sectionId, resolveKindsToCatalog(kinds, catalog, new Set(), limit));
}

/**
 * Included per-kid gift options — the fixed set from box rules (toy menorah, blank
 * dreidel, airdry clay dreidel, stuffie, extra book, DIY candles). Powers both a gift
 * line's swap shelf and the "add a gift for {kid}" row. Unlike the section resolvers,
 * this does NOT drop books, so the "extra book" gift stays available.
 */
export function resolveIncludedGiftOptions(
  catalog: CatalogItem[],
  excludeItemId?: string,
  limit = 6
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];
  const presents = SECTION_RULES.find((s) => s.id === 'presents');
  const giftSlot = presents?.slots.find((slot) => /^gift\b/i.test(cleanKindLabel(slot.defaultKind)));
  if (!giftSlot) return [];
  const kinds = giftSlot.swaps
    .filter((s) => s.price === 'included')
    .map((s) => s.targetSlotOrKind);
  const exclude = new Set(excludeItemId ? [excludeItemId] : []);
  return resolveKindsToCatalog(kinds, catalog, exclude, limit);
}

/** Strip planner notes in parentheses / em-dashes from boxRules kind labels. */
function cleanKindLabel(raw: string): string {
  return raw.replace(/\([^)]*\)/g, ' ').replace(/—.*$/, ' ').trim();
}

function itemMatchesSlotKind(item: CatalogItem, rawKind: string): boolean {
  const cleaned = cleanKindLabel(rawKind);
  if (!cleaned || /^donate$/i.test(cleaned)) return false;
  if (/^gelt\b/i.test(cleaned) && !/^gelt-(small|medium|party)/i.test(normalizeKind(cleaned))) {
    return /gelt/i.test(haystack(item)) || (item.slotId ?? '').startsWith('gelt');
  }
  if (/^story-book\b/i.test(cleaned) || (/book/i.test(cleaned) && /age|story/i.test(rawKind))) {
    return (
      item.category === 'Book' ||
      item.slotId === 'story' ||
      (item.slotId ?? '').startsWith('story') ||
      /book|story/i.test(haystack(item))
    );
  }
  if (/^gift\b/i.test(cleaned)) {
    return (
      item.slotId === 'gift' ||
      (item.slotId ?? '').startsWith('gift-') ||
      !!(item.defaultGiftAges && item.defaultGiftAges.length)
    );
  }
  return matchesKind(item, cleaned);
}

export function findSlotRuleForItem(sectionId: BoxSectionId, item: CatalogItem) {
  const section = SECTION_RULES.find((s) => s.id === sectionId);
  if (!section) return undefined;
  for (const slot of section.slots) {
    if (itemMatchesSlotKind(item, slot.defaultKind)) return slot;
  }
  for (const slot of section.slots) {
    for (const s of slot.swaps) {
      if (s.price === 'donate') continue;
      if (itemMatchesSlotKind(item, s.targetSlotOrKind)) return slot;
    }
  }
  if (section.slots.length === 1) return section.slots[0];
  return undefined;
}

/**
 * Price to charge when swapping `sourceItem` for `targetItem` within `sectionId`.
 * Returns `0` when the source item's slot rule documents `targetItem` as an
 * `'included'` (free) swap. Returns `undefined` when no matching slot rule / swap
 * offer is found — callers should fall back to the standard tier-based add-on price
 * (e.g. `boxAddOnUnitCents`) for anything outside the documented swap graph.
 *
 * `'extra'`-priced offers intentionally do NOT resolve here — per product policy,
 * those aren't swaps at all (they're à la carte add-ons purchased alongside the
 * existing item), so a caller reaching this with an `'extra'` target should treat it
 * as "not a free swap" and fall back too.
 */
export function resolveFreeSwapUnitCents(
  sourceItem: CatalogItem | undefined,
  targetItem: CatalogItem,
  sectionId: BoxSectionId
): number | undefined {
  if (!sourceItem) return undefined;
  const slotRule = findSlotRuleForItem(sectionId, sourceItem);
  if (!slotRule) return undefined;
  // Swapping back to the slot's own default is always free.
  if (itemMatchesSlotKind(targetItem, slotRule.defaultKind)) return 0;
  const offer = slotRule.swaps.find((s) => itemMatchesSlotKind(targetItem, s.targetSlotOrKind));
  if (!offer) return undefined;
  return offer.price === 'included' ? 0 : undefined;
}

function sameSlotPeers(item: CatalogItem, catalog: CatalogItem[], limit: number): CatalogItem[] {
  const slotId = (item.slotId ?? '').trim();
  const defaultSlot = (item.defaultSlot ?? '').trim();
  const out: CatalogItem[] = [];
  for (const c of catalog) {
    if (out.length >= limit) break;
    if (c.id === item.id) continue;
    if (slotId && c.slotId === slotId) {
      out.push(c);
      continue;
    }
    if (defaultSlot && (c.defaultSlot === defaultSlot || c.slotId === defaultSlot)) {
      out.push(c);
    }
  }
  return out;
}

function isFoodMixCatalogItem(item: CatalogItem): boolean {
  const hay = haystack(item);
  if (/stuffie|plush|toy|cookie|napkin|gelt|menorah|candle|dreidel|book/.test(hay)) return false;
  return /latke|sufgan|applesauce|\bmix\b/.test(hay) || item.category === 'Food';
}

function isMenorahOrCandleCatalogItem(item: CatalogItem): boolean {
  const hay = haystack(item);
  return (
    item.category === 'Menorah' ||
    item.category === 'Candles' ||
    /menorah|hanukkiah/.test(hay) ||
    (/candle/.test(hay) && !/cookie/.test(hay))
  );
}

/** Block nonsense cross-practice swaps (e.g. latke mix ↔ Lego menorah). */
function isIncompatibleSwap(source: CatalogItem, target: CatalogItem): boolean {
  if (source.id === target.id) return true;
  if (isFoodMixCatalogItem(source) && isMenorahOrCandleCatalogItem(target)) return true;
  if (isMenorahOrCandleCatalogItem(source) && isFoodMixCatalogItem(target)) return true;
  return false;
}

/**
 * Per-line swap shelf options for My Box / gift customize.
 * Prefer catalog.swapOptions → matching boxRules slot swaps → same-slot peers → section peers.
 */
export function resolveSwapOptionsForItem(
  item: CatalogItem,
  catalog: CatalogItem[],
  limit = 6,
  opts?: { includeSectionPeers?: boolean }
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];
  const includeSectionPeers = opts?.includeSectionPeers !== false;
  const sectionId = displaySectionForCatalogItem(item);

  if (item.swapOptions?.length) {
    const fromIds = item.swapOptions
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is CatalogItem => !!c && c.id !== item.id && !isIncompatibleSwap(item, c));
    const scoped =
      sectionId === 'story' ? fromIds : fromIds.filter((c) => !isBookishCatalogItem(c));
    if (scoped.length) return scoped.slice(0, limit);
  }

  const slotRule = findSlotRuleForItem(sectionId, item);
  const slotDefaultKind = slotRule ? concreteDefaultKind(slotRule) : undefined;
  const kinds = (
    slotRule
      ? [
          // Default first so a swapped-away default is offered back at the top.
          ...(slotDefaultKind ? [slotDefaultKind] : []),
          ...slotRule.swaps.filter((s) => s.price === 'included').map((s) => s.targetSlotOrKind),
        ]
      : collectSwapKinds(sectionId)
  ).filter((k) => sectionId === 'story' || !isBookUpsellOrSwapKind(k));

  const exclude = new Set([item.id]);
  const out = excludeBooksUnlessStory(
    sectionId,
    resolveKindsToCatalog(kinds, catalog, exclude, limit).filter((c) => !isIncompatibleSwap(item, c))
  );
  const seen = new Set(out.map((i) => i.id));

  if (out.length < limit) {
    for (const peer of sameSlotPeers(item, catalog, limit)) {
      if (out.length >= limit) break;
      if (seen.has(peer.id)) continue;
      if (isIncompatibleSwap(item, peer)) continue;
      if (sectionId !== 'story' && isBookishCatalogItem(peer)) continue;
      seen.add(peer.id);
      out.push(peer);
    }
  }

  if (!includeSectionPeers) {
    return excludeBooksUnlessStory(sectionId, out).slice(0, limit);
  }

  // Broad section peers only when we couldn't pin a slot swap graph
  // (avoids mixing gelt into dreidel shelves and vice versa).
  if (out.length < limit && !slotRule) {
    for (const c of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(c.id) || seen.has(c.id)) continue;
      if (displaySectionForCatalogItem(c) !== sectionId) continue;
      if (isIncompatibleSwap(item, c)) continue;
      if (sectionId !== 'story' && isBookishCatalogItem(c)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }

  // Last resort: if the slot graph resolved to nothing (missing SKUs), still surface
  // same-section peers so Swap appears.
  if (out.length === 0) {
    for (const c of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(c.id) || seen.has(c.id)) continue;
      if (displaySectionForCatalogItem(c) !== sectionId) continue;
      if (isIncompatibleSwap(item, c)) continue;
      if (sectionId !== 'story' && isBookishCatalogItem(c)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }

  return excludeBooksUnlessStory(sectionId, out).slice(0, limit);
}
