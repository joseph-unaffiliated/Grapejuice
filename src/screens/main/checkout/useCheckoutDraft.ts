import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useAuthStore } from '../../../stores/authStore';
import { useGuestSessionStore } from '../../../stores/guestSessionStore';
import { useSession } from '../../../hooks/useSession';
import { boxDraftService } from '../../../services/firestore/boxDraft';
import { catalogService } from '../../../services/firestore/catalog';
import { getHanukkahConfig, isBoxLocked, effectiveLockAt } from '../../../services/firestore/config';
import {
  totalCents,
  DEFAULT_BOX_PRICE_CENTS,
  SHIPPING_FLAT_CENTS,
} from '../../../services/box/buildDefaultBox';
import { EXPEDITED_SHIPPING_CENTS } from '../../../services/box/pricing';
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

const ADDRESS_STORAGE_KEY = 'gj.checkout.shippingAddress';

function readStoredAddress(): ShippingAddress | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ADDRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShippingAddress>;
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...emptyShippingAddress, ...parsed, country: parsed.country || 'US' };
  } catch {
    return null;
  }
}

function writeStoredAddress(address: ShippingAddress): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(address));
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredCheckoutAddress(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ADDRESS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function useCheckoutDraft(householdId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { household } = useSession();
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);

  const [lineItems, setLineItems] = useState<BoxLineItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [address, setAddress] = useState<ShippingAddress>(
    () => readStoredAddress() ?? emptyShippingAddress
  );
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [boxPriceCents, setBoxPriceCents] = useState(DEFAULT_BOX_PRICE_CENTS);
  const [expeditedAvailable, setExpeditedAvailable] = useState(false);
  const [expeditedShipping, setExpeditedShipping] = useState(false);
  const [hanukkahConfig, setHanukkahConfig] = useState<Awaited<
    ReturnType<typeof getHanukkahConfig>
  > | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [config, items] = await Promise.all([getHanukkahConfig(), catalogService.getAll()]);
    setHanukkahConfig(config);
    setCatalog(items);
    setBoxPriceCents(config.boxPriceCents ?? DEFAULT_BOX_PRICE_CENTS);
    setExpeditedAvailable(config.expeditedShippingEnabled === true);
    setLocked(isBoxLocked(effectiveLockAt(config, false)));

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
    if (!hanukkahConfig) return;
    setLocked(isBoxLocked(effectiveLockAt(hanukkahConfig, expeditedShipping)));
  }, [hanukkahConfig, expeditedShipping]);

  useEffect(() => {
    load();
  }, [load]);

  const updateAddress = (patch: Partial<ShippingAddress>) => {
    setAddress((prev) => {
      const next = { ...prev, ...patch };
      writeStoredAddress(next);
      return next;
    });
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
  const shippingCents = SHIPPING_FLAT_CENTS + (expeditedShipping ? EXPEDITED_SHIPPING_CENTS : 0);
  const taxCents = Math.round((subtotal + shippingCents) * 0.075);
  const preCreditTotal = subtotal + shippingCents + taxCents;
  const giftCreditCents = household?.giftCreditCents ?? 0;
  const platformCreditCents = household?.platformCreditCents ?? 0;
  const giftCreditApplied = Math.min(giftCreditCents, preCreditTotal);
  const remainingAfterGift = preCreditTotal - giftCreditApplied;
  const platformCreditApplied = Math.min(platformCreditCents, remainingAfterGift);
  const creditApplied = giftCreditApplied + platformCreditApplied;
  const total = preCreditTotal - creditApplied;

  return {
    lineItems,
    catalog,
    address,
    setAddress,
    updateAddress,
    loading,
    locked,
    boxPriceCents,
    expeditedAvailable,
    expeditedShipping,
    setExpeditedShipping,
    total,
    subtotal,
    shippingCents,
    taxCents,
    preCreditTotal,
    giftCreditApplied,
    platformCreditApplied,
    creditApplied,
    validateAddress,
    normalizedAddress,
  };
}
