import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { catalogService } from '../../services/firestore/catalog';
import { SHIPPING_FLAT_CENTS } from '../../services/box/buildDefaultBox';
import { checkoutTotalsAfterCredit } from '../../services/box/pricing';
import { usePromo } from '../../services/promo/usePromo';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import type { BoxLineItem, CatalogItem, ShippingAddress } from '../../types/pilot';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';
import { normalizeShippingAddress, validateShippingAddress } from '../../utils/formValidation';

export function useMarketplaceCheckout() {
  const { household } = useSession();
  const cartItems = useMarketplaceCartStore((s) => s.items);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [address, setAddress] = useState<ShippingAddress>(emptyShippingAddress);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const items = await catalogService.getAll();
    setCatalog(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateAddress = (patch: Partial<ShippingAddress>) => {
    setAddress((prev) => ({ ...prev, ...patch }));
  };

  const normalizedAddress = (): ShippingAddress => normalizeShippingAddress(address);

  const validateAddress = () => validateShippingAddress(address);

  const subtotal = cartItems.reduce(
    (sum, li) => sum + li.unitCents * Math.max(1, li.quantity || 1),
    0
  );
  const shippingCents = SHIPPING_FLAT_CENTS;
  const promo = usePromo(subtotal);
  const priced = checkoutTotalsAfterCredit({
    merchandiseCents: subtotal + shippingCents,
    giftCreditCents: household?.giftCreditCents ?? 0,
    platformCreditCents: household?.platformCreditCents ?? 0,
    discountCents: promo.discountCents,
  });
  const { taxCents, giftCreditApplied, platformCreditApplied, totalCents: total } = priced;

  const checkoutLineItems: BoxLineItem[] = cartItems;

  return {
    lineItems: checkoutLineItems,
    catalog,
    address,
    updateAddress,
    loading,
    subtotal,
    shippingCents,
    taxCents,
    giftCreditApplied,
    platformCreditApplied,
    promo,
    discountCents: priced.discountApplied,
    total,
    validateAddress,
    normalizedAddress,
  };
}
