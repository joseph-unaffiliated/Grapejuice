import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '../../../stores/authStore';
import { useGuestSessionStore } from '../../../stores/guestSessionStore';
import { boxDraftService } from '../../../services/firestore/boxDraft';
import { catalogService } from '../../../services/firestore/catalog';
import { getHanukkahConfig, isBoxLocked } from '../../../services/firestore/config';
import {
  totalCents,
  DEFAULT_BOX_PRICE_CENTS,
  SHIPPING_FLAT_CENTS,
} from '../../../services/box/buildDefaultBox';
import type { BoxLineItem, CatalogItem, ShippingAddress } from '../../../types/pilot';

export const emptyShippingAddress: ShippingAddress = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  stateProvince: '',
  postalCode: '',
  country: 'US',
};

export function useCheckoutDraft(householdId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);

  const [lineItems, setLineItems] = useState<BoxLineItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [address, setAddress] = useState<ShippingAddress>(emptyShippingAddress);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [boxPriceCents, setBoxPriceCents] = useState(DEFAULT_BOX_PRICE_CENTS);

  const load = useCallback(async () => {
    setLoading(true);
    const [config, items] = await Promise.all([getHanukkahConfig(), catalogService.getAll()]);
    setCatalog(items);
    setBoxPriceCents(config.boxPriceCents ?? DEFAULT_BOX_PRICE_CENTS);
    setLocked(isBoxLocked(config.lockAt));

    if (!isAuthenticated) {
      setLineItems(guestLineItems);
      setLoading(false);
      return;
    }

    if (!householdId) {
      setLineItems([]);
      setLoading(false);
      return;
    }

    const draft = await boxDraftService.get(householdId);
    setLineItems(draft?.lineItems ?? []);
    setLoading(false);
  }, [householdId, isAuthenticated, guestLineItems]);

  useEffect(() => {
    load();
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

  const validateAddress = (): boolean => {
    if (!address.name.trim() || !address.line1.trim() || !address.city.trim()) {
      Alert.alert('Missing fields', 'Please enter name, street address, and city.');
      return false;
    }
    if (!address.stateProvince.trim() || !address.postalCode.trim()) {
      Alert.alert('Missing fields', 'Please enter state/province and postal code.');
      return false;
    }
    return true;
  };

  const subtotal = totalCents(lineItems, boxPriceCents);
  const shippingCents = SHIPPING_FLAT_CENTS;
  const taxCents = Math.round((subtotal + shippingCents) * 0.075);

  return {
    lineItems,
    catalog,
    address,
    setAddress,
    updateAddress,
    loading,
    locked,
    boxPriceCents,
    total: subtotal + shippingCents + taxCents,
    subtotal,
    shippingCents,
    taxCents,
    validateAddress,
    normalizedAddress,
  };
}
