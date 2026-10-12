/**
 * What the phone layouts show about your box outside the editor: the menu card, the
 * homepage card, the account card and checkout summaries. Reads the same draft, orders
 * and catalog as My Box; never writes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useBoxDraft } from './useBoxDraft';
import { useCatalog } from './useCatalog';
import { usePaymentGate } from './usePaymentGate';
import { useSession } from './useSession';
import { getHanukkahConfig, peekHanukkahConfig } from '../services/firestore/config';
import { coalesceLinesByItemId } from '../components/box/boxLineDisplay';
import { chargeableLineTotal } from '../services/box/pricing';
import { listBoxCentsForKids } from '../services/box/boxRules';
import { formatCatalogDollars } from '../services/box/buildDefaultBox';
import { primaryPhoto, SAMPLE_BOX_IDS } from '../components/mobile/catalogPhotos';
import type { BoxThumb } from '../components/mobile/BoxSummary';

export type BoxGlanceState = 'none' | 'draft' | 'set';

export function lockShortLabel(lockAt: string | null): string {
  if (!lockAt) return 'the lock date';
  return new Date(lockAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

export function daysUntilLock(lockAt: string | null, now = Date.now()): number | null {
  if (!lockAt) return null;
  return Math.max(0, Math.ceil((new Date(lockAt).getTime() - now) / 86_400_000));
}

export const NOT_HELD_COPY = "Until you add shipping and payment, your items aren't secured and may sell out.";

export function useBoxGlance() {
  const { lineItems, children, loading: draftLoading } = useBoxDraft();
  const { items: catalog } = useCatalog();
  const { cardOnFile, openOrder, ordersLoading } = usePaymentGate();
  const { loading: sessionLoading } = useSession();
  const [lockAt, setLockAt] = useState<string | null>(() => peekHanukkahConfig()?.lockAt ?? null);

  useEffect(() => {
    let alive = true;
    void getHanukkahConfig().then((c) => alive && setLockAt(c.lockAt));
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const hasBox = lineItems.length > 0 || !!openOrder;
  const state: BoxGlanceState = !hasBox ? 'none' : openOrder ? 'set' : 'draft';
  const totalCents = useMemo(() => {
    if (!hasBox) return listBoxCentsForKids(1);
    return listBoxCentsForKids(Math.max(1, children.length)) + chargeableLineTotal(lineItems);
  }, [hasBox, children.length, lineItems]);

  /** Up to six thumbnails: real box rows when there is a box, the sample set otherwise. */
  const thumbs = useMemo((): BoxThumb[] => {
    if (!hasBox) return SAMPLE_BOX_IDS.map((id) => ({ id, imageUrl: primaryPhoto(byId.get(id)) }));
    return coalesceLinesByItemId(lineItems)
      .slice(0, 6)
      .map((row) => ({ id: row.itemId, imageUrl: primaryPhoto(byId.get(row.itemId)), count: row.quantity > 1 ? row.quantity : undefined }));
  }, [hasBox, lineItems, byId]);

  return {
    loading: draftLoading || ordersLoading || sessionLoading,
    state,
    hasBox,
    lineItems,
    thumbs,
    totalCents,
    totalLabel: formatCatalogDollars(totalCents),
    cardOnFile,
    openOrder,
    lockAt,
    lockShort: lockShortLabel(lockAt),
    daysLeft: daysUntilLock(lockAt),
    kidCount: children.length,
  };
}
