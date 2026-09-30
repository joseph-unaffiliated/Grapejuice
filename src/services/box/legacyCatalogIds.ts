import type { BoxLineItem } from '../../types/pilot';

/** Catalog ids renamed in Airtable (the sync slugifies names, so a rename changes the id). */
export const LEGACY_CATALOG_ID_MAP: Record<string, string> = {
  'sufganiot-kit': 'sufganiyot-kit',
};

/** Applesauce now ships inside the latke kit — no standalone line. */
const RETIRED_BOX_IDS = new Set(['applesauce', 'applesauce-kit']);

export function remapLegacyCatalogId(id: string): string {
  return LEGACY_CATALOG_ID_MAP[id] ?? id;
}

export function remapLegacyCatalogIds(ids: string[]): string[] {
  let changed = false;
  const next = ids.map((id) => {
    const mapped = remapLegacyCatalogId(id);
    if (mapped !== id) changed = true;
    return mapped;
  });
  return changed ? Array.from(new Set(next)) : ids;
}

function baseSlotId(slotId: string): string {
  return slotId.replace(/::x$/i, '');
}

/**
 * Drop retired products and remap renamed catalog ids so older drafts,
 * guest sessions, and carts still resolve.
 */
export function retireLegacyBoxLines(
  lineItems: BoxLineItem[]
): { lineItems: BoxLineItem[]; dirty: boolean } {
  let dirty = false;
  const next: BoxLineItem[] = [];
  for (const li of lineItems) {
    if (RETIRED_BOX_IDS.has(li.itemId) || RETIRED_BOX_IDS.has(baseSlotId(li.slotId ?? ''))) {
      dirty = true;
      continue;
    }
    const itemId = remapLegacyCatalogId(li.itemId);
    let slotId = li.slotId;
    for (const [from, to] of Object.entries(LEGACY_CATALOG_ID_MAP)) {
      if (slotId?.includes(from)) slotId = slotId.split(from).join(to);
    }
    if (itemId !== li.itemId || slotId !== li.slotId) {
      dirty = true;
      next.push({ ...li, itemId, slotId });
    } else {
      next.push(li);
    }
  }
  return { lineItems: dirty ? next : lineItems, dirty };
}
