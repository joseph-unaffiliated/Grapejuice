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
import { prefetchPartnerInvites } from '../services/account/accountPrefetch';
import { warmBoxCheckout } from '../services/checkout/checkoutPrefetch';
import { coalesceLinesByItemId } from '../components/box/boxLineDisplay';
import { chargeableLineTotal } from '../services/box/pricing';
import { listBoxCentsForKids } from '../services/box/boxRules';
import { formatCatalogDollars } from '../services/box/buildDefaultBox';
import { primaryPhoto, SAMPLE_BOX_IDS } from '../components/mobile/catalogPhotos';
import type { BoxThumb } from '../components/mobile/BoxSummary';
import { lockShortLabel } from '../constants/hanukkahBoxLock';

export { lockShortLabel };

export type BoxGlanceState = 'none' | 'draft' | 'set';

export function daysUntilLock(lockAt: string | null, now = Date.now()): number | null {
  if (!lockAt) return null;
  return Math.max(0, Math.ceil((new Date(lockAt).getTime() - now) / 86_400_000));
}

export const NOT_HELD_COPY = "Until you add shipping and payment, your items aren't secured and may sell out.";

export function useBoxGlance() {
  const { lineItems, children, loading: draftLoading } = useBoxDraft();
  const { items: catalog } = useCatalog();
  const { cardOnFile, openOrder, ordersLoading } = usePaymentGate();
  const { household, loading: sessionLoading } = useSession();
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

  // Home, the menu, and account all read this glance. Partner invites are a Cloud Function,
  // so start them here — the account page must not wait on that cold start to paint.
  useEffect(() => {
    if (sessionLoading || !household?.id) return;
    prefetchPartnerInvites(household.id);
  }, [sessionLoading, household?.id]);

  // Warm checkout while a draft box is on screen.
  useEffect(() => {
    if (sessionLoading || draftLoading) return;
    if (state !== 'draft' || !household?.id || !lineItems.length) return;
    warmBoxCheckout({
      householdId: household.id,
      cardOnFile,
      totalCents,
      paymentMethodId: household.stripeDefaultPaymentMethodId,
    });
  }, [
    sessionLoading,
    draftLoading,
    state,
    household?.id,
    household?.stripeDefaultPaymentMethodId,
    cardOnFile,
    lineItems.length,
    totalCents,
  ]);

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
