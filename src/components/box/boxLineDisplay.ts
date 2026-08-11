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

/**
 * Wrappable for Give Presents checklist.
 * Prefer catalog `wrappable`; otherwise WRAP_POLICY kind heuristics.
 */
export function isLineWrappable(li: BoxLineItem, item?: CatalogItem | null): boolean {
  if (isWrapControlSlot(li.slotId)) return false;
  if (item?.wrappable === true) return true;
  if (item?.wrappable === false) return false;

  const hay = `${item?.id ?? li.itemId} ${item?.name ?? li.label ?? ''} ${item?.category ?? ''} ${item?.slotId ?? ''}`.toLowerCase();
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

export function childNamesForLines(
  lines: BoxLineItem[],
  children: ChildProfile[]
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const li of lines) {
    if (!li.childId || seen.has(li.childId)) continue;
    seen.add(li.childId);
    const kid = children.find((c) => c.id === li.childId);
    names.push(kid?.name?.trim() || 'your kid');
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
