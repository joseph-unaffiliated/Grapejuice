import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { catalogSlotId } from '../../services/box/buildDefaultBox';
import { WRAP_POLICY } from '../../services/box/boxRules';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { BoxDisplaySectionId } from '../../constants/boxDisplaySections';

/** One UI row after coalescing duplicate catalog SKUs. */
export type CoalescedBoxLine = {
  key: string;
  itemId: string;
  /** Canonical line used for swap / detail / votes (first in group). */
  primary: BoxLineItem;
  /** All underlying draft lines for this SKU in the section. */
  lines: BoxLineItem[];
  quantity: number;
  /**
   * How many units are still at $0 (practice / included). Paid `::x` overflow is
   * excluded — card meta shows “N included” from this, while `quantity` is total.
   */
  includedQuantity: number;
  childIds: string[];
  unitCents: number;
  /** Curation reason from the primary line, if any. */
  note?: string;
};

export function isWrapControlSlot(slotId: string): boolean {
  const base = catalogSlotId(slotId);
  return (
    base === 'wrapping' ||
    base === 'wrapping-paper' ||
    base === 'pre-wrap' ||
    base === 'wrap'
  );
}

/** True for the wrapping-paper SKU / line (not pre-wrap mode). */
export function isWrappingPaperItem(
  itemId: string,
  catalog: readonly CatalogItem[] = [],
  line?: Pick<BoxLineItem, 'slotId' | 'itemId' | 'label'>
): boolean {
  if (line && isWrapControlSlot(line.slotId)) {
    const base = catalogSlotId(line.slotId);
    if (base === 'pre-wrap') return false;
    if (base === 'wrapping-paper' || base === 'wrapping') return true;
  }
  const item = catalog.find((c) => c.id === itemId);
  const hay = `${itemId} ${item?.name ?? ''} ${item?.slotId ?? ''} ${item?.defaultSlot ?? ''} ${line?.label ?? ''}`.toLowerCase();
  if (/pre.?wrap/.test(hay)) return false;
  if (
    catalogSlotId(item?.slotId ?? '') === 'wrapping-paper' ||
    catalogSlotId(item?.defaultSlot ?? '') === 'wrapping-paper' ||
    item?.defaultSlot === 'wrapping-paper'
  ) {
    return true;
  }
  return /wrapping.?paper/.test(hay);
}

/** Gift-per-kid lines — full cards belong in natural practice sections, not Presents. */
export function isGiftSlotLine(li: BoxLineItem): boolean {
  return catalogSlotId(li.slotId) === 'gift' || li.slotId.startsWith('gift-');
}

function lineHaystack(li: BoxLineItem, item?: CatalogItem | null): string {
  return `${item?.id ?? li.itemId} ${item?.name ?? li.label ?? ''} ${item?.category ?? ''} ${item?.slotId ?? ''}`.toLowerCase();
}

function isPracticeDreidelSlot(slotId: string): boolean {
  const base = catalogSlotId(slotId);
  return base === 'wood-dreidel' || base === 'blank-dreidel' || base === 'airdry-dreidel';
}

function isGeltSlot(slotId: string): boolean {
  const base = catalogSlotId(slotId);
  return base === 'gelt' || base.startsWith('gelt-') || base.startsWith('extra-gelt');
}

function isStorySlot(slotId: string): boolean {
  const base = catalogSlotId(slotId);
  return base === 'story' || base.startsWith('story');
}

/**
 * Practice allocation copy: gelt + wood dreidels ship as a household share
 * (kids + grownups), not named “One for…” gifts.
 */
export function isPerKidHouseholdLine(li: BoxLineItem, item?: CatalogItem | null): boolean {
  if (catalogSlotId(li.slotId) === 'wood-dreidel') return true;
  if (isGeltSlot(li.slotId)) return true;
  const hay = lineHaystack(li, item);
  if (/gelt/.test(hay) || item?.category === 'Gelt') return true;
  return false;
}

/**
 * Present/gift cards (including when coalesced into dreidel/story practice sections).
 * Prefer gift-* slots; also catalog gift/keepsake presents and airdry/plush heuristics.
 * Excludes practice wood/blank/airdry slots and gelt.
 */
export function isGiftPresentLine(li: BoxLineItem, item?: CatalogItem | null): boolean {
  if (isGiftSlotLine(li)) return true;
  if (isPracticeDreidelSlot(li.slotId) || isGeltSlot(li.slotId) || isStorySlot(li.slotId)) {
    return false;
  }
  if (isPerKidHouseholdLine(li, item)) return false;
  if (item?.slot === 'gift') return true;
  const hay = lineHaystack(li, item);
  // Airdry is often cataloged as keepsake; plush/stuffie are gift presents.
  if (li.childId && /air.?dry|plush|stuffie/.test(hay)) return true;
  if (item?.wrappable === true && !!li.childId && item.slot !== 'story') return true;
  return false;
}

export function isStoryBookLine(li: BoxLineItem, item?: CatalogItem | null): boolean {
  if (isStorySlot(li.slotId)) return true;
  if (item?.slot === 'story' || item?.category === 'Book') return true;
  const hay = lineHaystack(li, item);
  return /book|story/.test(hay) && !isGiftPresentLine(li, item);
}

/** How the Included status line should attribute this coalesced card. */
export type BoxItemAttributionKind = 'gift' | 'one-for' | 'per-kid-household';

export function resolveBoxItemAttributionKind(
  lines: BoxLineItem[],
  item?: CatalogItem | null
): BoxItemAttributionKind | undefined {
  if (lines.some((li) => isPerKidHouseholdLine(li, item))) return 'per-kid-household';
  if (lines.some((li) => isGiftPresentLine(li, item))) return 'gift';
  if (lines.some((li) => isStoryBookLine(li, item))) return 'one-for';
  if (lines.some((li) => !!li.childId || !!childIdFromSlot(li.slotId))) return 'one-for';
  return undefined;
}

/**
 * Wrappable for Give Presents checklist.
 * Prefer catalog `wrappable`; otherwise WRAP_POLICY kind heuristics.
 */
export function isLineWrappable(li: BoxLineItem, item?: CatalogItem | null): boolean {
  if (isWrapControlSlot(li.slotId)) return false;
  if (item?.wrappable === true) return true;
  if (item?.wrappable === false) return false;

  const hay = lineHaystack(li, item);
  // Gifts and toys/plush/keepsakes are always wrappable — even when their name
  // references food (e.g. "Crispy, the Latke Stuffie"). Check these before the
  // food "mixes" rule so a per-kid gift SKU is never dropped from the wrap list.
  if (isGiftSlotLine(li)) return true;
  if (/plush|stuffie|toy|lego|blanket|pyjama|pajama/.test(hay)) return true;
  // Classic wood play dreidels are table pieces (like gelt), not presents.
  if (
    (/wood|classic/.test(hay) && /dreidel/.test(hay) && !/air.?dry|clay|blank|draw|plush|stuffie/.test(hay)) ||
    catalogSlotId(li.slotId) === 'wood-dreidel' ||
    item?.slotId === 'wood-dreidel'
  ) {
    return false;
  }
  if (WRAP_POLICY.notWrappableKinds.some((k) => {
    if (k === 'gelt') return /gelt/.test(hay);
    if (k === 'mixes') return /mix|latke|sufgan/.test(hay) && !/book|toy|dreidel|menorah/.test(hay);
    if (k === 'candles-normal') return /candle/.test(hay) && !/diy|myo|make|kit|craft/.test(hay) && !/electric/.test(hay);
    if (k === 'candles-electric') return /electric.*candle|candle.*electric/.test(hay);
    if (k === 'napkins') return /napkin/.test(hay);
    return false;
  })) {
    return false;
  }
  if (/book|story/.test(hay) || item?.category === 'Book') return true;
  // Craft / gift dreidels wrap; classic wood already rejected above.
  if (/dreidel/.test(hay) || item?.category === 'Dreidel') return true;
  if (/menorah|hanukkiah/.test(hay) || item?.category === 'Menorah') return true;
  if (/diy|myo|make.?your|craft.?kit/.test(hay) && /candle/.test(hay)) return true;
  return WRAP_POLICY.wrappableKinds.some((k) => {
    if (k === 'books') return /book/.test(hay);
    if (k === 'toys') return /toy|plush|stuffie|lego/.test(hay);
    if (k === 'diy-candles') return /diy|myo/.test(hay) && /candle/.test(hay);
    if (k === 'menorahs') return /menorah|hanukkiah/.test(hay);
    if (k === 'dreidels') return /dreidel/.test(hay);
    return false;
  });
}

/**
 * Wrap-chip attribution, e.g. “Gift for Sam”.
 * Pass `householdKidCount` so single-kid boxes can omit the redundant name line.
 */
export function formatPresentAttribution(
  childNames: string[],
  opts?: { householdKidCount?: number }
): string | undefined {
  if ((opts?.householdKidCount ?? 0) === 1) return undefined;
  const names = childNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return undefined;
  if (names.length === 1) return `Gift for ${names[0]}`;
  return names.map((n) => `gift for ${n}`).join(', ').replace(/^gift/, 'Gift');
}

const PLACEHOLDER_KID_NAME = /^your kid$/i;

/** Household share phrasing for gelt / wood dreidels. */
export const PER_KID_HOUSEHOLD_ATTRIBUTION = '1 per person';

function kidNamesForAttribution(childNames: string[]): string[] {
  return childNames
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && !PLACEHOLDER_KID_NAME.test(n));
}

/**
 * Per-kid attribution for My Box practice cards: "One for Asa" / "One for Asa, one for Eden".
 * Skips empty and placeholder names so missing names don't produce "One for your kid".
 */
export function formatKidOneForAttribution(childNames: string[]): string | undefined {
  const names = kidNamesForAttribution(childNames);
  if (names.length === 0) return undefined;
  if (names.length === 1) return `One for ${names[0]}`;
  return names.map((n) => `one for ${n}`).join(', ').replace(/^one/, 'One');
}

/**
 * Per-kid attribution for gift/present My Box cards: "A gift for Asa" /
 * "A gift for Asa, a gift for Eden".
 */
export function formatKidGiftForAttribution(childNames: string[]): string | undefined {
  const names = kidNamesForAttribution(childNames);
  if (names.length === 0) return undefined;
  if (names.length === 1) return `A gift for ${names[0]}`;
  return names.map((n) => `a gift for ${n}`).join(', ').replace(/^a/, 'A');
}

/**
 * Status line above the product title on My Box item cards.
 * - Paid / upsell: "+$4" (via `formatMoney`, typically `formatCatalogDollars`);
 *   when `quantity` > 1, "+$4 each"
 * - Included: "1 included ($6 value)" — count from `includedQuantity`, value from catalog
 * - `per-kid-household`: "…  |  1 per person"
 * - Gift / one-for kid names live on the image chip now — not this meta line.
 */
export function formatBoxItemStatusMeta(
  unitCents: number,
  childNames: string[],
  formatMoney: (cents: number) => string,
  /** Catalog member price for included-item "($X value)" copy. */
  valueCents?: number,
  /**
   * Attribution mode. `true` = gift (back-compat). Prefer
   * `'gift' | 'one-for' | 'per-kid-household'` from `resolveBoxItemAttributionKind`.
   * Only `per-kid-household` still appends to this line; gift/one-for are chips.
   */
  attribution?: boolean | BoxItemAttributionKind,
  /** Coalesced card quantity — appends “each” on paid multi-qty à la carte. */
  quantity?: number,
  /** Free / practice units on this card — drives “N included”. */
  includedQuantity?: number
): string {
  if (unitCents > 0) {
    const money = formatMoney(unitCents).trim();
    const base = money.startsWith('+') ? money : `+${money}`;
    return quantity != null && quantity > 1 ? `${base} each` : base;
  }
  const includedCount =
    includedQuantity != null && includedQuantity > 0
      ? includedQuantity
      : quantity != null && quantity > 0
        ? quantity
        : 1;
  const valueSuffix =
    valueCents != null && valueCents > 0
      ? ` (${formatMoney(valueCents).trim()} value)`
      : '';
  const valueLabel = `${includedCount} included${valueSuffix}`;
  const kind: BoxItemAttributionKind | undefined =
    attribution === true
      ? 'gift'
      : attribution === false || attribution == null
        ? undefined
        : attribution;
  if (kind === 'per-kid-household') {
    return `${valueLabel}  |  ${PER_KID_HOUSEHOLD_ATTRIBUTION}`;
  }
  // childNames kept in the signature for call-site stability; gift/one-for chips own that copy.
  void childNames;
  return valueLabel;
}

/** A per-kid book line lives in a `story-{childId}` slot. */
function isStorySlotLine(li: BoxLineItem): boolean {
  return catalogSlotId(li.slotId) === 'story';
}

/** Why a kid has no distinct gift: their gift was removed, or it duplicates another item. */
export type KidGiftNeed = { child: ChildProfile; reason: 'donated' | 'duplicated' };

/**
 * Kids who lack a *distinct* gift — either no `gift-{childId}` line exists
 * (donated/removed) or the gift's SKU also appears on a non-gift box line
 * (e.g. the default airdry-dreidel gift after the dreidel slot was swapped to airdry).
 */
export function kidsNeedingGift(
  lineItems: BoxLineItem[],
  children: ChildProfile[]
): KidGiftNeed[] {
  const giftLineByChild = new Map<string, BoxLineItem>();
  const nonGiftItemIds = new Set<string>();
  for (const li of lineItems) {
    if (isGiftSlotLine(li)) {
      const cid = li.childId || childIdFromSlot(li.slotId);
      if (cid) giftLineByChild.set(cid, li);
    } else {
      nonGiftItemIds.add(li.itemId);
    }
  }
  const out: KidGiftNeed[] = [];
  for (const child of children) {
    const giftLine = giftLineByChild.get(child.id);
    if (!giftLine) out.push({ child, reason: 'donated' });
    else if (nonGiftItemIds.has(giftLine.itemId)) out.push({ child, reason: 'duplicated' });
  }
  return out;
}

/** Kids with no `story-{childId}` book line (donated/removed). */
export function kidsNeedingBook(
  lineItems: BoxLineItem[],
  children: ChildProfile[]
): ChildProfile[] {
  const covered = new Set<string>();
  for (const li of lineItems) {
    if (!isStorySlotLine(li)) continue;
    if ((li.unitCents ?? 0) > 0) continue; // paid extras don't fill the included slot
    const cid = li.childId || childIdFromSlot(li.slotId);
    if (!cid) continue;
    const direct = children.find((c) => c.id === cid);
    if (direct) {
      covered.add(direct.id);
      continue;
    }
    // Guest drafts use guest-0…; after account persist, kids get Firestore ids.
    const guest = /^guest-(\d+)$/.exec(cid);
    if (guest) {
      const byIndex = children[Number(guest[1])];
      if (byIndex) covered.add(byIndex.id);
    }
  }
  return children.filter((c) => !covered.has(c.id));
}

/** Parse child id from `gift-{id}` / `story-{id}` / `wood-dreidel-{id}` line slots. */
export function childIdFromSlot(slotId: string): string | undefined {
  const base = catalogSlotId(slotId);
  if (base === slotId || !slotId.startsWith(`${base}-`)) return undefined;
  const suffix = slotId.slice(base.length + 1);
  return suffix || undefined;
}

function resolveChildDisplayName(
  childId: string,
  children: ChildProfile[]
): string | undefined {
  const direct = children.find((c) => c.id === childId);
  const directName = direct?.name?.trim();
  if (directName && !PLACEHOLDER_KID_NAME.test(directName)) return directName;

  // Guest drafts use guest-0…; after account persist, kids get Firestore ids but
  // lines may still say guest-N — map by index when order is preserved.
  const guest = /^guest-(\d+)$/.exec(childId);
  if (guest) {
    const byIndex = children[Number(guest[1])]?.name?.trim();
    if (byIndex && !PLACEHOLDER_KID_NAME.test(byIndex)) return byIndex;
  }

  // Single-kid household: ID mismatch still yields the one real name.
  if (children.length === 1) {
    const only = children[0]?.name?.trim();
    if (only && !PLACEHOLDER_KID_NAME.test(only)) return only;
  }
  return undefined;
}

/**
 * Floating image-badge label for a per-kid gift card, e.g. "A gift for Sam".
 * When multiple kids share a coalesced card, name them all ("Gifts for Sam & Ava").
 * Falls back to `fallback` when a gift line has no resolvable display name.
 */
export function giftBadgeLabelForLines(
  lines: BoxLineItem[],
  children: ChildProfile[],
  fallback?: string
): string | undefined {
  if (children.length === 1) return undefined;
  if (!lines.some((li) => isGiftSlotLine(li))) return undefined;
  const names = childNamesForLines(lines, children);
  if (names.length === 1) return `A gift for ${names[0]}`;
  if (names.length > 1) return `Gifts for ${names.join(' & ')}`;
  if (names.length === 0 && fallback) return fallback;
  return undefined;
}

/**
 * Floating image-badge for a per-kid practice card (craft dreidel, etc.), e.g. "One for Sam".
 */
export function oneForBadgeLabelForLines(
  lines: BoxLineItem[],
  children: ChildProfile[],
  fallback?: string
): string | undefined {
  if (children.length === 1) return undefined;
  if (lines.some((li) => isGiftSlotLine(li) || isStorySlotLine(li))) return undefined;
  const names = childNamesForLines(lines, children);
  if (names.length === 1) return `One for ${names[0]}`;
  if (names.length > 1) return `One for ${names.join(' & ')}`;
  if (names.length === 0) {
    const attributed = lines.some((li) => !!(li.childId || childIdFromSlot(li.slotId)));
    if (attributed) return fallback ?? 'One for them';
  }
  return undefined;
}

/**
 * Floating image-badge for a per-kid book card, e.g. "A book for Sam".
 */
export function bookBadgeLabelForLines(
  lines: BoxLineItem[],
  children: ChildProfile[],
  fallback?: string
): string | undefined {
  if (children.length === 1) return undefined;
  if (!lines.some((li) => isStorySlotLine(li))) return undefined;
  const names = childNamesForLines(lines, children);
  if (names.length === 1) return `A book for ${names[0]}`;
  if (names.length > 1) return `Books for ${names.join(' & ')}`;
  if (names.length === 0) {
    const attributed = lines.some((li) => !!(li.childId || childIdFromSlot(li.slotId)));
    if (attributed) return fallback ?? 'A book for them';
  }
  return undefined;
}

export function childNamesForLines(
  lines: BoxLineItem[],
  children: ChildProfile[]
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const li of lines) {
    const id = li.childId || childIdFromSlot(li.slotId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = resolveChildDisplayName(id, children);
    if (name) names.push(name);
  }
  return names;
}

/** Collapse same `itemId` into one row; sum quantities; collect child ids.
 * Per-kid gifts and books stay separate cards so each kid keeps their badge.
 */
export function coalesceLinesByItemId(lines: BoxLineItem[]): CoalescedBoxLine[] {
  const order: string[] = [];
  const map = new Map<string, BoxLineItem[]>();
  for (const li of lines) {
    const kidId =
      (isGiftSlotLine(li) || isStorySlotLine(li)) && (li.childId || childIdFromSlot(li.slotId))
        ? li.childId || childIdFromSlot(li.slotId)
        : undefined;
    const key = kidId ? `${li.itemId}::${kidId}` : li.itemId;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(li);
  }
  return order.map((key) => {
    const group = map.get(key)!;
    const itemId = group[0]!.itemId;
    const quantity = group.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
    const includedQuantity = group
      .filter((li) => li.unitCents <= 0 && !li.slotId.includes('::x'))
      .reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
    const childIds = [
      ...new Set(group.map((li) => li.childId).filter((id): id is string => !!id)),
    ];
    const primary = group[0]!;
    // Prefer Included when any non-extra line is free (e.g. wood dreidel + stray paid overflow).
    const hasFreePractice = group.some(
      (li) => li.unitCents <= 0 && !li.slotId.includes('::x')
    );
    return {
      key: `${key}:${group.map((g) => g.slotId).join('+')}`,
      itemId,
      primary,
      lines: group,
      quantity,
      includedQuantity,
      childIds,
      unitCents: hasFreePractice ? 0 : primary.unitCents,
      note: primary.curationNote,
    };
  });
}

/**
 * Full product cards for a practice section.
 * Presents: wrapping paper as a normal card; pre-wrap is a mode (no card).
 */
export function fullCardLinesForSection(
  sectionId: BoxDisplaySectionId,
  lines: BoxLineItem[]
): BoxLineItem[] {
  if (sectionId === 'presents') {
    const wrap = lines.filter((li) => {
      if (!isWrapControlSlot(li.slotId)) return false;
      const base = catalogSlotId(li.slotId);
      return base === 'wrapping-paper' || base === 'wrapping';
    });
    const rest = lines.filter((li) => !isGiftSlotLine(li) && !isWrapControlSlot(li.slotId));
    return [...wrap, ...rest];
  }
  return lines;
}

export function wrapControlLines(lineItems: BoxLineItem[]): BoxLineItem[] {
  return lineItems.filter((li) => isWrapControlSlot(li.slotId));
}

export function wrappableLinesInBox(
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): BoxLineItem[] {
  return lineItems.filter((li) => {
    if (isCashDonationLine(li)) return false;
    if (li.itemId.startsWith('extra-') || li.slotId.includes('::x')) return false;
    if (isWrapControlSlot(li.slotId)) return false;
    const item = catalog.find((c) => c.id === li.itemId);
    return isLineWrappable(li, item);
  });
}

/**
 * Prefers mutating `quantity` on an existing line over cloning `-extra-` rows.
 * Returns null when qty would go below 1 (caller should donate/remove).
 */
export function applyQuantityDelta(
  allLines: BoxLineItem[],
  group: CoalescedBoxLine,
  delta: number
): BoxLineItem[] | null {
  const total = group.quantity;
  const nextTotal = total + delta;
  if (nextTotal < 1) return null;

  const slotIds = new Set(group.lines.map((l) => l.slotId));
  const others = allLines.filter((li) => !slotIds.has(li.slotId));

  if (group.lines.length === 1) {
    const only = group.lines[0]!;
    return [...others, { ...only, quantity: nextTotal }];
  }

  // Multiple per-kid / duplicate lines: keep one canonical row with quantity.
  const primary = group.lines[0]!;
  return [
    ...others,
    {
      ...primary,
      quantity: nextTotal,
      // Shared attribution when coalesced into one draft line.
      childId: group.childIds.length === 1 ? group.childIds[0] : primary.childId,
      label: primary.label?.replace(/\s*\(extra\)\s*$/i, ''),
    },
  ];
}

export function removeCoalescedGroup(
  allLines: BoxLineItem[],
  group: CoalescedBoxLine
): BoxLineItem[] {
  const slotIds = new Set(group.lines.map((l) => l.slotId));
  return allLines.filter((li) => !slotIds.has(li.slotId));
}

/**
 * Stable slot for free-filling an empty practice section. Prefer the section’s
 * default slot when free, then a per-item addon id — never leave `slotId` empty,
 * and never use catalog `extra-*` slots (those used to be filtered from the UI,
 * so free-adds appeared to no-op).
 */
export function uniqueSlotForFreeSectionAdd(
  sectionId: BoxDisplaySectionId,
  item: CatalogItem,
  existing: BoxLineItem[]
): string {
  const sectionPreferred: Partial<Record<BoxDisplaySectionId, string>> = {
    candles: 'candles',
    dreidel: 'wood-dreidel',
    food: 'latke-mix',
  };
  const used = new Set(existing.map((li) => li.slotId));
  const isUsableSlot = (s: string) =>
    Boolean(s) &&
    !s.startsWith('extra-') &&
    s !== 'gift' &&
    s !== 'story' &&
    !s.includes('::x');
  const candidates = [
    sectionPreferred[sectionId],
    item.defaultSlot?.trim(),
    catalogSlotId(item.slotId) || undefined,
    item.slotId?.trim(),
    item.id,
  ].filter((s): s is string => Boolean(s && isUsableSlot(s)));
  for (const c of candidates) {
    if (!used.has(c)) return c;
  }
  return `addon-${item.id}`;
}

/**
 * Practice slots that count as the section’s included default (donate removes these).
 * Gift/story lines and paid `addon-*` extras do not fill these.
 */
const INCLUDED_PRACTICE_SLOT_IDS: Partial<Record<BoxDisplaySectionId, readonly string[]>> = {
  candles: ['candles'],
  dreidel: ['wood-dreidel', 'blank-dreidel', 'airdry-dreidel'],
  food: ['latke-mix', 'sufganiyot-mix', 'applesauce', 'latke-kit', 'sufganiyot-kit', 'latke-recipe-printed'],
};

/**
 * True when the section’s included practice line was donated/removed — restoring
 * beeswax / MYO / electric candles (etc.) should be $0, not an add-on, even if
 * other cards (e.g. a kid gift menorah) still sit in the section.
 */
export function includedPracticeSlotVacant(
  sectionId: BoxDisplaySectionId,
  lineItems: BoxLineItem[]
): boolean {
  const slots = INCLUDED_PRACTICE_SLOT_IDS[sectionId];
  if (!slots?.length) return false;
  return !lineItems.some((li) => {
    if (isGiftSlotLine(li)) return false;
    if (li.slotId.startsWith('addon-') || li.slotId.startsWith('extra-')) return false;
    if (li.slotId.includes('::x')) return false;
    if ((li.unitCents ?? 0) > 0) return false;
    return slots.includes(catalogSlotId(li.slotId));
  });
}

/**
 * Assign `item` as `childId`’s included gift at $0.
 * If that SKU is already in the box as a non-gift (e.g. paid à la carte) line,
 * convert it instead of adding a duplicate paid+included pair.
 */
export function assignKidGiftLines(
  lineItems: BoxLineItem[],
  childId: string,
  item: CatalogItem
): BoxLineItem[] {
  const giftSlot = `gift-${childId}`;
  const existingGift = lineItems.find(
    (li) =>
      isGiftSlotLine(li) && (li.childId === childId || childIdFromSlot(li.slotId) === childId)
  );
  const convertible = lineItems.find((li) => li.itemId === item.id && !isGiftSlotLine(li));

  if (existingGift) {
    let next = lineItems.map((li) =>
      li.slotId === existingGift.slotId
        ? { ...li, itemId: item.id, unitCents: 0, label: item.name, childId }
        : li
    );
    if (convertible && convertible.slotId !== existingGift.slotId) {
      const qty = convertible.quantity ?? 1;
      if (qty <= 1) {
        next = next.filter((li) => li.slotId !== convertible.slotId);
      } else {
        next = next.map((li) =>
          li.slotId === convertible.slotId ? { ...li, quantity: qty - 1 } : li
        );
      }
    }
    return next;
  }

  if (convertible) {
    const qty = convertible.quantity ?? 1;
    if (qty <= 1) {
      return lineItems.map((li) =>
        li.slotId === convertible.slotId
          ? {
              ...li,
              slotId: giftSlot,
              childId,
              unitCents: 0,
              label: item.name,
              itemId: item.id,
            }
          : li
      );
    }
    return [
      ...lineItems.map((li) =>
        li.slotId === convertible.slotId ? { ...li, quantity: qty - 1 } : li
      ),
      {
        slotId: giftSlot,
        itemId: item.id,
        childId,
        quantity: 1,
        unitCents: 0,
        label: item.name,
      },
    ];
  }

  return [
    ...lineItems,
    {
      slotId: giftSlot,
      itemId: item.id,
      childId,
      quantity: 1,
      unitCents: 0,
      label: item.name,
    },
  ];
}

/**
 * Assign `item` as `childId`’s included book at $0.
 * Converts a paid / unassigned copy of the same SKU instead of duplicating.
 */
export function assignKidBookLines(
  lineItems: BoxLineItem[],
  childId: string,
  item: CatalogItem
): BoxLineItem[] {
  const bookSlot = `story-${childId}`;
  const existingBook = lineItems.find(
    (li) =>
      isStorySlotLine(li) && (li.childId === childId || childIdFromSlot(li.slotId) === childId)
  );
  const convertible = lineItems.find(
    (li) =>
      li.itemId === item.id &&
      !(isStorySlotLine(li) && (li.childId === childId || childIdFromSlot(li.slotId) === childId))
  );

  if (existingBook) {
    let next = lineItems.map((li) =>
      li.slotId === existingBook.slotId
        ? {
            ...li,
            slotId: bookSlot,
            itemId: item.id,
            unitCents: 0,
            label: item.name,
            childId,
          }
        : li
    );
    if (convertible && convertible.slotId !== existingBook.slotId) {
      const qty = convertible.quantity ?? 1;
      if (qty <= 1) {
        next = next.filter((li) => li.slotId !== convertible.slotId);
      } else {
        next = next.map((li) =>
          li.slotId === convertible.slotId ? { ...li, quantity: qty - 1 } : li
        );
      }
    }
    return next;
  }

  if (convertible) {
    const qty = convertible.quantity ?? 1;
    if (qty <= 1) {
      return lineItems.map((li) =>
        li.slotId === convertible.slotId
          ? {
              ...li,
              slotId: bookSlot,
              childId,
              unitCents: 0,
              label: item.name,
              itemId: item.id,
            }
          : li
      );
    }
    return [
      ...lineItems.map((li) =>
        li.slotId === convertible.slotId ? { ...li, quantity: qty - 1 } : li
      ),
      {
        slotId: bookSlot,
        itemId: item.id,
        childId,
        quantity: 1,
        unitCents: 0,
        label: item.name,
      },
    ];
  }

  return [
    ...lineItems,
    {
      slotId: bookSlot,
      itemId: item.id,
      childId,
      quantity: 1,
      unitCents: 0,
      label: item.name,
    },
  ];
}

const EXTRA_UNIT_SUFFIX = '::x';

/**
 * Seed included baselines from free (unitCents===0) lines.
 *
 * - Empty map: record every free SKU currently in the box (initial / default allotment).
 * - Non-empty map: only *raise* counts for SKUs already tracked — never add newly added
 *   free extras (Add more / $0 included-tier adds). Those must not inflate Donated when
 *   removed.
 */
export function seedIncludedBaselines(
  lineItems: BoxLineItem[],
  into: Map<string, number> = new Map()
): Map<string, number> {
  const allowNewKeys = into.size === 0;
  for (const li of lineItems) {
    if (li.slotId.endsWith(EXTRA_UNIT_SUFFIX)) continue;
    if ((li.unitCents ?? 0) > 0) continue;
    const qty = Math.max(0, li.quantity ?? 1);
    const inc = Math.max(qty, li.includedQty ?? 0);
    if (inc <= 0) continue;
    if (!allowNewKeys && !into.has(li.itemId)) continue;
    into.set(li.itemId, Math.max(into.get(li.itemId) ?? 0, inc));
  }
  return into;
}

/**
 * Member-price value of included units that were donated/removed (not charged; not
 * subtracted from box total). Uses per-SKU included baselines vs current free qty.
 * Only SKUs in `includedBaselines` count — paid à-la-carte add/remove and newly added
 * free extras are excluded.
 *
 * Wrapping paper is excluded while anything is marked “to be wrapped”: removing paper
 * in favor of included pre-wrap is not a donation.
 */
export function donatedMemberValueCents(
  lineItems: BoxLineItem[],
  catalog: CatalogItem[],
  includedBaselines: ReadonlyMap<string, number>,
  opts?: { wrapSelectedCount?: number }
): number {
  if (includedBaselines.size === 0) return 0;
  const skipWrappingPaper = (opts?.wrapSelectedCount ?? 0) > 0;

  const freeQtyByItem = new Map<string, number>();
  for (const li of lineItems) {
    if (li.slotId.endsWith(EXTRA_UNIT_SUFFIX)) continue;
    if ((li.unitCents ?? 0) > 0) continue;
    const qty = Math.max(0, li.quantity ?? 1);
    freeQtyByItem.set(li.itemId, (freeQtyByItem.get(li.itemId) ?? 0) + qty);
  }

  let cents = 0;
  for (const [itemId, baselineRaw] of includedBaselines) {
    if (skipWrappingPaper && isWrappingPaperItem(itemId, catalog)) continue;
    const baseline = Math.max(0, baselineRaw);
    if (baseline <= 0) continue;
    const freeQty = freeQtyByItem.get(itemId) ?? 0;
    const missing = Math.max(0, baseline - freeQty);
    if (missing <= 0) continue;
    const item = catalog.find((c) => c.id === itemId);
    if (!item) continue;
    const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
    const unit = memberCents > 0 ? memberCents : nonMemberCents;
    if (unit <= 0) continue;
    cents += missing * unit;
  }
  return cents;
}

/** Summary-bar cash donation — charged in Total, not shown as a section card. */
export const CASH_DONATION_SLOT_ID = 'cash-donation';
export const CASH_DONATION_ITEM_ID = 'cash-donation';

export function isCashDonationLine(li: Pick<BoxLineItem, 'slotId' | 'itemId'>): boolean {
  return li.slotId === CASH_DONATION_SLOT_ID || li.itemId === CASH_DONATION_ITEM_ID;
}

export function getCashDonationCents(lineItems: readonly BoxLineItem[]): number {
  let cents = 0;
  for (const li of lineItems) {
    if (!isCashDonationLine(li)) continue;
    cents += Math.max(0, li.unitCents ?? 0) * Math.max(1, li.quantity ?? 1);
  }
  return cents;
}

/** Upsert / clear the cash-donation line. `cents <= 0` removes it. */
export function withCashDonationCents(
  lineItems: BoxLineItem[],
  cents: number
): BoxLineItem[] {
  const without = lineItems.filter((li) => !isCashDonationLine(li));
  const amount = Math.max(0, Math.round(cents));
  if (amount <= 0) return without;
  return [
    ...without,
    {
      slotId: CASH_DONATION_SLOT_ID,
      itemId: CASH_DONATION_ITEM_ID,
      quantity: 1,
      unitCents: amount,
      label: 'Cash donation',
    },
  ];
}

/** Parse a typed dollar string ("5", "5.50", "$12") into cents. Empty → 0. */
export function parseDonationDollarsToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.round(dollars * 100);
}

/**
 * While wrapping paper remains in the box and anything is marked “to be wrapped”,
 * charge a flat EXTRA_FLAT once on the paper line. Clearing the wrap list restores $0.
 * Pre-wrap mode (no paper line) is unchanged.
 */
export function syncWrappingPaperUnitCentsForWrapSelection(
  lineItems: BoxLineItem[],
  catalog: readonly CatalogItem[],
  wrapSelectedCount: number,
  extraFlatCents: number
): BoxLineItem[] {
  const charge = wrapSelectedCount > 0 ? extraFlatCents : 0;
  let dirty = false;
  const next = lineItems.map((li) => {
    if (!isWrappingPaperItem(li.itemId, catalog, li)) return li;
    const current = li.unitCents ?? 0;
    // Only flip included ($0) or the wrap-fee EXTRA_FLAT — leave other prices alone.
    if (current !== 0 && current !== extraFlatCents) return li;
    if (current === charge) return li;
    dirty = true;
    return { ...li, unitCents: charge };
  });
  return dirty ? next : lineItems;
}

/**
 * After donating the included practice item, convert one paid same-section sibling
 * (non-gift) to included so the practice slot is filled and Add-ons drop.
 */
export function promotePaidSiblingToIncludedPractice(
  lineItems: BoxLineItem[],
  sectionId: BoxDisplaySectionId,
  catalog: readonly CatalogItem[],
  displaySectionFor: (
    li: BoxLineItem,
    item: CatalogItem | undefined
  ) => BoxDisplaySectionId
): BoxLineItem[] {
  if (!includedPracticeSlotVacant(sectionId, lineItems)) return lineItems;

  const paid = lineItems.find((li) => {
    if (isGiftSlotLine(li)) return false;
    if ((li.unitCents ?? 0) <= 0) return false;
    const item = catalog.find((c) => c.id === li.itemId);
    return displaySectionFor(li, item) === sectionId;
  });
  if (!paid) return lineItems;

  const item = catalog.find((c) => c.id === paid.itemId);
  if (!item) return lineItems;

  const qty = paid.quantity ?? 1;
  if (qty <= 1) {
    return lineItems.map((li) =>
      li.slotId === paid.slotId
        ? {
            ...li,
            unitCents: 0,
            displaySectionId: sectionId,
            slotId: uniqueSlotForFreeSectionAdd(
              sectionId,
              item,
              lineItems.filter((x) => x.slotId !== paid.slotId)
            ),
            includedQty: Math.max(1, li.includedQty ?? 1),
          }
        : li
    );
  }

  return [
    ...lineItems.map((li) =>
      li.slotId === paid.slotId ? { ...li, quantity: qty - 1 } : li
    ),
    {
      slotId: uniqueSlotForFreeSectionAdd(sectionId, item, lineItems),
      itemId: item.id,
      quantity: 1,
      unitCents: 0,
      label: item.name,
      displaySectionId: sectionId,
      includedQty: 1,
    },
  ];
}
