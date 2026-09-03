import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { catalogService } from '../../services/firestore/catalog';
import { SHIPPING_FLAT_CENTS } from '../../services/box/buildDefaultBox';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import type { BoxLineItem, CatalogItem, ShippingAddress } from '../../types/pilot';
import { emptyShippingAddress } from '../main/checkout/useCheckoutDraft';

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

  const normalizedAddress = (): ShippingAddress => ({
    ...address,
    name: address.name.trim(),
    line1: address.line1.trim(),
    line2: address.line2?.trim() || undefined,
    city: address.city.trim(),
    stateProvince: address.stateProvince.trim(),
    postalCode: address.postalCode.trim(),
  });

  const validateAddress = (): string | null => {
    if (!address.name.trim() || !address.line1.trim() || !address.city.trim()) {
      return 'Please enter name, street address, and city.';
    }
    if (!address.stateProvince.trim() || !address.postalCode.trim()) {
      return 'Please enter state/province and postal code.';
    }
    return null;
  };

  const subtotal = cartItems.reduce(
    (sum, li) => sum + li.unitCents * Math.max(1, li.quantity || 1),
    0
  );
  const shippingCents = SHIPPING_FLAT_CENTS;
  const taxCents = Math.round((subtotal + shippingCents) * 0.075);
  const preCreditTotal = subtotal + shippingCents + taxCents;
  const giftCreditCents = household?.giftCreditCents ?? 0;
  const platformCreditCents = household?.platformCreditCents ?? 0;
  const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
  const remainingAfterGift = preCreditTotal - giftCreditApplied;
  const platformCreditApplied = Math.min(platformCreditCents, remainingAfterGift);
  const total = preCreditTotal - giftCreditApplied - platformCreditApplied;

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
    total,
    validateAddress,
    normalizedAddress,
  };
}
