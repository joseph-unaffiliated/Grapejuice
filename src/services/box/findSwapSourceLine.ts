/**
 * Resolve which box line a catalog SKU can replace (swap graph, slot family, section peers).
 */

import { resolveSwapOptionsForItem } from './sectionUpsells';
import {
  displaySectionForCatalogItem,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

/** Sections where same-section SKUs can substitute (pay the price difference). */
const PEER_SWAP_SECTIONS: ReadonlySet<BoxDisplaySectionId> = new Set([
  'dreidel',
  'candles',
  'story',
]);

function normalizeSlotKey(slotId: string | undefined | null): string {
  return (slotId ?? '').trim().toLowerCase().replace(/-\d+$/, '');
}

function haystackOf(item: Pick<CatalogItem, 'id' | 'name' | 'slotId'> & { category?: string }): string {
  return `${item.id} ${item.name} ${item.slotId ?? ''} ${item.category ?? ''}`.toLowerCase();
}

function isGeltHay(hay: string): boolean {
  return /gelt/.test(hay);
}

function isDreidelHay(hay: string): boolean {
  return /dreidel/.test(hay) && !isGeltHay(hay);
}

function lineHaystack(li: BoxLineItem, catalog: CatalogItem[]): string {
  const current = catalog.find((c) => c.id === li.itemId);
  if (current) return haystackOf(current);
  return `${li.itemId} ${li.label ?? ''} ${li.slotId}`.toLowerCase();
}

/**
 * Box line this item can replace — explicit swap graph, same slot family,
 * same display section, or dreidel↔dreidel by name (wood → brass).
 */
export function findSwapSourceLine(
  item: CatalogItem,
  lineItems: BoxLineItem[],
  catalog: CatalogItem[]
): BoxLineItem | null {
  const itemHay = haystackOf(item);
  const itemIsDreidel = isDreidelHay(itemHay);
  const scored: { li: BoxLineItem; rank: number }[] = [];

  for (const li of lineItems) {
    if (li.itemId === item.id) continue;
    const current = catalog.find((c) => c.id === li.itemId);
    const liHay = lineHaystack(li, catalog);

    let rank = -1;

    if (current) {
      const opts = resolveSwapOptionsForItem(current, catalog, 24);
      if (opts.some((o) => o.id === item.id)) {
        rank = 0;
      }
    }

    if (rank < 0) {
      const lineSlot = normalizeSlotKey(li.slotId);
      const itemSlot = normalizeSlotKey(item.slotId);
      const currentSlot = normalizeSlotKey(current?.slotId || current?.defaultSlot);
      const itemDefault = normalizeSlotKey(item.defaultSlot);
      if (
        lineSlot &&
        itemSlot &&
        (lineSlot === itemSlot ||
          lineSlot === itemDefault ||
          itemSlot === currentSlot ||
          (itemDefault && currentSlot && itemDefault === currentSlot) ||
          (lineSlot.includes('dreidel') &&
            itemSlot.includes('dreidel') &&
            !lineSlot.includes('gelt')))
      ) {
        rank = 1;
      }
    }

    if (rank < 0 && current) {
      const secA = displaySectionForCatalogItem(current);
      const secB = displaySectionForCatalogItem(item);
      if (
        secA &&
        secA === secB &&
        PEER_SWAP_SECTIONS.has(secA) &&
        !(secA === 'dreidel' && isGeltHay(liHay) !== isGeltHay(itemHay))
      ) {
        rank = 2;
      }
    }

    if (rank < 0 && itemIsDreidel && isDreidelHay(liHay)) {
      rank = 3;
    }

    if (rank >= 0) scored.push({ li, rank });
  }

  scored.sort(
    (a, b) => a.rank - b.rank || (a.li.unitCents ?? 0) - (b.li.unitCents ?? 0)
  );
  return scored[0]?.li ?? null;
}
