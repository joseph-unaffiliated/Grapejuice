import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { catalogSlotId } from '../../services/box/buildDefaultBox';
import { WRAP_POLICY } from '../../services/box/boxRules';
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
  childIds: string[];
  unitCents: number;
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
  if (/dreidel/.test(hay) || item?.category === 'Dreidel') return true;
  if (/menorah|hanukkiah/.test(hay) || item?.category === 'Menorah') return true;
  if (/diy|myo|make.?your|craft.?kit/.test(hay) && /candle/.test(hay)) return true;
  if (/plush|stuffie|toy|lego|blanket|pyjama|pajama/.test(hay)) return true;
  if (isGiftSlotLine(li)) return true;
  return WRAP_POLICY.wrappableKinds.some((k) => {
    if (k === 'books') return /book/.test(hay);
    if (k === 'toys') return /toy|plush|stuffie|lego/.test(hay);
    if (k === 'diy-candles') return /diy|myo/.test(hay) && /candle/.test(hay);
    if (k === 'menorahs') return /menorah|hanukkiah/.test(hay);
    if (k === 'dreidels') return /dreidel/.test(hay);
    return false;
  });
}

export function formatPresentAttribution(childNames: string[]): string | undefined {
  const names = childNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return undefined;
  if (names.length === 1) return `Present for ${names[0]}`;
  return names.map((n) => `one for ${n}`).join(', ').replace(/^one/, 'One');
}

const PLACEHOLDER_KID_NAME = /^your kid$/i;

/** Household share phrasing for gelt / wood dreidels. */
export const PER_KID_HOUSEHOLD_ATTRIBUTION = '1 per kid (and some for the grownups)';

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
 * - Paid / upsell: "+$4" (via `formatMoney`, typically `formatCatalogDollars`)
 * - Included: "Included ($4 value)" when `valueCents` > 0 (catalog member price),
 *   else "Included"
 * - `per-kid-household`: "…  |  1 per kid (and some for the grownups)"
 * - `gift` / `isGift: true`: "…  |  A gift for Asa"
 * - `one-for` / default with kids: "…  |  One for Asa, one for Eden"
 */
export function formatBoxItemStatusMeta(
  unitCents: number,
  childNames: string[],
  formatMoney: (cents: number) => string,
  /** Catalog member price for included-item "($X value)" copy; omit/0 → plain "Included". */
  valueCents?: number,
  /**
   * Attribution mode. `true` = gift (back-compat). Prefer
   * `'gift' | 'one-for' | 'per-kid-household'` from `resolveBoxItemAttributionKind`.
   */
  attribution?: boolean | BoxItemAttributionKind
): string {
  if (unitCents > 0) {
    const money = formatMoney(unitCents).trim();
    return money.startsWith('+') ? money : `+${money}`;
  }
  const valueLabel =
    valueCents != null && valueCents > 0
      ? `Included (${formatMoney(valueCents).trim()} value)`
      : 'Included';
  const kind: BoxItemAttributionKind | undefined =
    attribution === true
      ? 'gift'
      : attribution === false || attribution == null
        ? undefined
        : attribution;
  let attributionText: string | undefined;
  if (kind === 'per-kid-household') {
    attributionText = PER_KID_HOUSEHOLD_ATTRIBUTION;
  } else if (kind === 'gift') {
    attributionText = formatKidGiftForAttribution(childNames);
  } else {
    attributionText = formatKidOneForAttribution(childNames);
  }
  return attributionText ? `${valueLabel}  |  ${attributionText}` : valueLabel;
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

/** Collapse same `itemId` into one row; sum quantities; collect child ids. */
export function coalesceLinesByItemId(lines: BoxLineItem[]): CoalescedBoxLine[] {
  const order: string[] = [];
  const map = new Map<string, BoxLineItem[]>();
  for (const li of lines) {
    if (!map.has(li.itemId)) {
      map.set(li.itemId, []);
      order.push(li.itemId);
    }
    map.get(li.itemId)!.push(li);
  }
  return order.map((itemId) => {
    const group = map.get(itemId)!;
    const quantity = group.reduce((s, li) => s + Math.max(1, li.quantity || 1), 0);
    const childIds = [
      ...new Set(group.map((li) => li.childId).filter((id): id is string => !!id)),
    ];
    const primary = group[0]!;
    return {
      key: `${itemId}:${group.map((g) => g.slotId).join('+')}`,
      itemId,
      primary,
      lines: group,
      quantity,
      childIds,
      unitCents: primary.unitCents,
    };
  });
}

/**
 * Full product cards for a practice section.
 * Presents: wrapping paper (wrap-control) as a normal card; gift-* dump cards stay in natural sections.
 */
export function fullCardLinesForSection(
  sectionId: BoxDisplaySectionId,
  lines: BoxLineItem[]
): BoxLineItem[] {
  if (sectionId === 'presents') {
    // Wrap control first (wrapping paper default), then other presents-section cards.
    const wrap = lines.filter((li) => isWrapControlSlot(li.slotId));
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
    if (li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-')) return false;
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
