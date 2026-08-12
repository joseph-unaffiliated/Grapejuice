/**
 * Resolve addable browse/upsell catalog rows for a My Box practice section.
 * Prefer boxRules upsells + extra-priced swap targets; fill from section catalog.
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

/** Upsell rail: explicit upsells + extra-priced swaps + food Add-more kinds. */
function collectUpsellKinds(sectionId: BoxSectionId): string[] {
  const section = SECTION_RULES.find((s) => s.id === sectionId);
  if (!section) return [];
  const kinds: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const k = normalizeKind(raw);
    if (k === 'donate' || seen.has(k)) return;
    seen.add(k);
    kinds.push(raw);
  };

  // Eat & Drink Add more: napkins + cookie cutters (included swaps, not only extras).
  if (sectionId === 'food') {
    push('cookie-cutters');
    push('napkins');
  }

  for (const slot of section.slots) {
    for (const u of slot.upsells ?? []) {
      push(u.targetSlotOrKind);
    }
    for (const s of slot.swaps) {
      if (s.price !== 'extra') continue;
      push(s.targetSlotOrKind);
    }
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

/** Books sort last in Add more rails. */
function sortBooksLast(items: CatalogItem[]): CatalogItem[] {
  const nonBooks: CatalogItem[] = [];
  const books: CatalogItem[] = [];
  for (const item of items) {
    if (isBookishCatalogItem(item)) books.push(item);
    else nonBooks.push(item);
  }
  return [...nonBooks, ...books];
}

/** Menorah / dreidel / book — second tier in Presents Add more. */
function isMenorahDreidelOrBook(item: CatalogItem): boolean {
  if (isBookishCatalogItem(item)) return true;
  const hay = haystack(item);
  if (item.category === 'Menorah' || /menorah|hanukkiah/.test(hay)) return true;
  if (item.category === 'Dreidel' || /dreidel/.test(hay)) return true;
  return false;
}

/**
 * Presents Add more:
 * 1) wrappable items that are not menorahs, dreidels, or books
 * 2) then an assortment of dreidels, menorahs, and books (books last within that band)
 */
function sortPresentsUpsells(items: CatalogItem[]): CatalogItem[] {
  const primary: CatalogItem[] = [];
  const assortment: CatalogItem[] = [];
  for (const item of items) {
    if (isMenorahDreidelOrBook(item)) assortment.push(item);
    else primary.push(item);
  }
  return [...primary, ...sortBooksLast(assortment)];
}

function isWrappableCatalogAddOn(item: CatalogItem): boolean {
  if (item.wrappable === true) return true;
  if (item.wrappable === false) return false;
  const hay = `${item.id} ${item.name} ${item.category ?? ''} ${item.slotId ?? ''}`.toLowerCase();
  if (/napkin|cookie.?cutter|gelt|latke|sufgan|applesauce|mix|wrapping|pre.?wrap/.test(hay)) {
    return false;
  }
  if (/book|story/.test(hay) || item.category === 'Book') return true;
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

/** Swap shelf: included + extra swaps (not donate). */
function collectSwapKinds(sectionId: BoxSectionId): string[] {
  const section = SECTION_RULES.find((s) => s.id === sectionId);
  if (!section) return [];
  const kinds: string[] = [];
  const seen = new Set<string>();
  for (const slot of section.slots) {
    for (const s of slot.swaps) {
      if (s.price === 'donate') continue;
      const k = normalizeKind(s.targetSlotOrKind);
      if (k === 'donate' || seen.has(k)) continue;
      seen.add(k);
      kinds.push(s.targetSlotOrKind);
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
 * Excludes SKUs already in the box; prefers boxRules targets, then section peers.
 * Presents: wrappable catalog add-ons not already in the box.
 * Books always sort last.
 */
export function resolveSectionUpsellItems(
  sectionId: BoxDisplaySectionId,
  catalog: CatalogItem[],
  excludeItemIds: ReadonlySet<string> | string[],
  limit = 8
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];
  const exclude = excludeItemIds instanceof Set ? excludeItemIds : new Set(excludeItemIds);

  // Give Presents Add more: wrapping-eligible catalog items not already in the box.
  if (sectionId === 'presents') {
    const out: CatalogItem[] = [];
    const seen = new Set<string>();
    for (const item of catalog) {
      if (exclude.has(item.id) || seen.has(item.id)) continue;
      if (!isWrappableCatalogAddOn(item)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return sortPresentsUpsells(out).slice(0, limit);
  }

  const kinds = collectUpsellKinds(sectionId);
  const out = resolveKindsToCatalog(kinds, catalog, exclude, limit);
  const seen = new Set(out.map((i) => i.id));

  if (out.length < limit) {
    for (const item of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(item.id) || seen.has(item.id)) continue;
      if (displaySectionForCatalogItem(item) !== sectionId) continue;
      if (sectionId === 'food' && !isFoodUpsellCandidate(item)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }

  return sortBooksLast(out.slice(0, limit));
}

/**
 * Swap alternatives for a section from boxRules (when catalog.swapOptions is empty).
 * Fills with same-section peers so Swap still appears when specific kinds are missing.
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
  const out = resolveKindsToCatalog(kinds, catalog, exclude, limit);
  const seen = new Set(out.map((i) => i.id));

  if (out.length < limit) {
    for (const item of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(item.id) || seen.has(item.id)) continue;
      if (displaySectionForCatalogItem(item) !== sectionId) continue;
      seen.add(item.id);
      out.push(item);
    }
  }

  return out.slice(0, limit);
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

function findSlotRuleForItem(sectionId: BoxSectionId, item: CatalogItem) {
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

/**
 * Per-line swap shelf options for My Box / gift customize.
 * Prefer catalog.swapOptions → matching boxRules slot swaps → same-slot peers → section peers.
 */
export function resolveSwapOptionsForItem(
  item: CatalogItem,
  catalog: CatalogItem[],
  limit = 6
): CatalogItem[] {
  if (!catalog.length || limit <= 0) return [];

  if (item.swapOptions?.length) {
    const fromIds = item.swapOptions
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is CatalogItem => !!c && c.id !== item.id);
    if (fromIds.length) return fromIds.slice(0, limit);
  }

  const sectionId = displaySectionForCatalogItem(item);
  const slotRule = findSlotRuleForItem(sectionId, item);
  const kinds = slotRule
    ? slotRule.swaps.filter((s) => s.price !== 'donate').map((s) => s.targetSlotOrKind)
    : collectSwapKinds(sectionId);

  const exclude = new Set([item.id]);
  const out = resolveKindsToCatalog(kinds, catalog, exclude, limit);
  const seen = new Set(out.map((i) => i.id));

  if (out.length < limit) {
    for (const peer of sameSlotPeers(item, catalog, limit)) {
      if (out.length >= limit) break;
      if (seen.has(peer.id)) continue;
      seen.add(peer.id);
      out.push(peer);
    }
  }

  // Broad section peers only when we couldn't pin a slot swap graph
  // (avoids mixing gelt into dreidel shelves and vice versa).
  if (out.length < limit && !slotRule) {
    for (const c of catalog) {
      if (out.length >= limit) break;
      if (exclude.has(c.id) || seen.has(c.id)) continue;
      if (displaySectionForCatalogItem(c) !== sectionId) continue;
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
      seen.add(c.id);
      out.push(c);
    }
  }

  return out.slice(0, limit);
}
