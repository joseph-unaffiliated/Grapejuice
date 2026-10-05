import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../../../stores/authStore';
import { useGuestSessionStore } from '../../../stores/guestSessionStore';
import { useSession } from '../../../hooks/useSession';
import { boxDraftService } from '../../../services/firestore/boxDraft';
import { catalogService } from '../../../services/firestore/catalog';
import { childrenService } from '../../../services/firestore/children';
import { getHanukkahConfig, isBoxLocked, effectiveLockAt } from '../../../services/firestore/config';
import {
  totalCents,
  DEFAULT_BOX_PRICE_CENTS,
  SHIPPING_FLAT_CENTS,
} from '../../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../../services/box/boxRules';
import { checkoutTotalsAfterCredit } from '../../../services/box/pricing';
import type { BoxLineItem, CatalogItem, ShippingAddress } from '../../../types/pilot';
import { validateShippingAddress } from '../../../utils/formValidation';

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
  const userId = useAuthStore((s) => s.user?.uid);
  const { household } = useSession();
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);

  const [lineItems, setLineItems] = useState<BoxLineItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [address, setAddress] = useState<ShippingAddress>(
    () => readStoredAddress() ?? emptyShippingAddress
  );
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [boxPriceCents, setBoxPriceCents] = useState(DEFAULT_BOX_PRICE_CENTS);
  const [hanukkahConfig, setHanukkahConfig] = useState<Awaited<
    ReturnType<typeof getHanukkahConfig>
  > | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [config, items, kids] = await Promise.all([
      getHanukkahConfig(),
      catalogService.getAll(),
      isAuthenticated && userId ? childrenService.list(userId) : Promise.resolve(null),
    ]);
    setHanukkahConfig(config);
    setCatalog(items);
    const kidCount = kids
      ? kids.length
      : guestDrafts.filter((d) => d.role !== 'adult').length;
    setBoxPriceCents(listBoxCentsForKids(Math.max(1, kidCount)));
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
  }, [householdId, isAuthenticated, userId, guestLineItems, guestDrafts]);

  useEffect(() => {
    if (!hanukkahConfig) return;
    setLocked(isBoxLocked(effectiveLockAt(hanukkahConfig, false)));
  }, [hanukkahConfig]);

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

  const validateAddress = () => validateShippingAddress(address);

  const subtotal = totalCents(lineItems, boxPriceCents);
  const shippingCents = SHIPPING_FLAT_CENTS;
  const priced = checkoutTotalsAfterCredit({
    merchandiseCents: subtotal + shippingCents,
    giftCreditCents: household?.giftCreditCents ?? 0,
    platformCreditCents: household?.platformCreditCents ?? 0,
  });
  const { taxCents, giftCreditApplied, platformCreditApplied, creditApplied, totalCents: total } = priced;

  return {
    lineItems,
    catalog,
    address,
    setAddress,
    updateAddress,
    loading,
    locked,
    lockAt: hanukkahConfig ? effectiveLockAt(hanukkahConfig, false) : null,
    boxPriceCents,
    total,
    subtotal,
    shippingCents,
    taxCents,
    giftCreditApplied,
    platformCreditApplied,
    creditApplied,
    validateAddress,
    normalizedAddress,
  };
}
