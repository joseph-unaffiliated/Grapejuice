import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../../../stores/authStore';
import { useGuestSessionStore } from '../../../stores/guestSessionStore';
import { useSession } from '../../../hooks/useSession';
import { boxDraftService } from '../../../services/firestore/boxDraft';
import { catalogService, peekCatalogItems } from '../../../services/firestore/catalog';
import { childrenService } from '../../../services/firestore/children';
import { getHanukkahConfig, isBoxLocked, effectiveLockAt, peekHanukkahConfig } from '../../../services/firestore/config';
import { liveCatalogItems } from '../../../services/catalog/liveCatalog';
import { peekBoxDraftCache } from '../../../hooks/useBoxDraft';
import {
  totalCents,
  DEFAULT_BOX_PRICE_CENTS,
  SHIPPING_FLAT_CENTS,
} from '../../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../../services/box/boxRules';
import { checkoutTotalsAfterCredit } from '../../../services/box/pricing';
import { usePromo } from '../../../services/promo/usePromo';
import type { BoxLineItem, CatalogItem, ShippingAddress } from '../../../types/pilot';
import { normalizeShippingAddress, validateShippingAddress } from '../../../utils/formValidation';

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

function catalogAlreadyLoaded(): CatalogItem[] {
  const peeked = peekCatalogItems();
  if (peeked?.length) return peeked;
  const live = liveCatalogItems.get();
  return !live.loading && live.value.length ? live.value : [];
}

/** What My Box (or Home) already has in memory. Enough to paint address + summary with no spinner. */
function readCheckoutSeed(householdId: string | undefined, isAuthenticated: boolean) {
  const catalog = catalogAlreadyLoaded();
  const config = peekHanukkahConfig();
  const draft = isAuthenticated ? peekBoxDraftCache(householdId) : null;
  const guest = useGuestSessionStore.getState();
  const guestKids = guest.childDrafts.filter((d) => d.role !== 'adult').length;
  const lineItems = draft?.lineItems ?? (isAuthenticated ? [] : guest.lineItems);
  const kidCount = draft ? draft.children.length : guestKids;
  const ready = !!config && catalog.length > 0 && lineItems.length > 0;
  return { catalog, config, lineItems, kidCount, ready };
}

export function useCheckoutDraft(householdId: string | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.uid);
  const { household } = useSession();
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);
  const [seed] = useState(() => readCheckoutSeed(householdId, isAuthenticated));

  const [lineItems, setLineItems] = useState<BoxLineItem[]>(seed.lineItems);
  const [catalog, setCatalog] = useState<CatalogItem[]>(seed.catalog);
  const [address, setAddress] = useState<ShippingAddress>(
    () => readStoredAddress() ?? emptyShippingAddress
  );
  const [loading, setLoading] = useState(!seed.ready);
  const [locked, setLocked] = useState(() =>
    seed.config ? isBoxLocked(effectiveLockAt(seed.config, false)) : false
  );
  const [boxPriceCents, setBoxPriceCents] = useState(() =>
    listBoxCentsForKids(Math.max(1, seed.kidCount || 1))
  );
  const [hanukkahConfig, setHanukkahConfig] = useState<Awaited<
    ReturnType<typeof getHanukkahConfig>
  > | null>(seed.config);

  const load = useCallback(async () => {
    const freshSeed = readCheckoutSeed(householdId, isAuthenticated);
    const paintNow = freshSeed.ready && !!freshSeed.config;
    if (paintNow && freshSeed.config) {
      setLineItems(freshSeed.lineItems);
      setCatalog(freshSeed.catalog);
      setHanukkahConfig(freshSeed.config);
      setLocked(isBoxLocked(effectiveLockAt(freshSeed.config, false)));
      setBoxPriceCents(listBoxCentsForKids(Math.max(1, freshSeed.kidCount || 1)));
      setLoading(false);
      void getHanukkahConfig()
        .then((config) => {
          setHanukkahConfig(config);
          setLocked(isBoxLocked(effectiveLockAt(config, false)));
        })
        .catch(() => undefined);
      if (isAuthenticated && userId) {
        void childrenService
          .list(userId)
          .then((kids) => setBoxPriceCents(listBoxCentsForKids(Math.max(1, kids.length))))
          .catch(() => undefined);
      }
      if (isAuthenticated && householdId && !peekBoxDraftCache(householdId)) {
        void boxDraftService.get(householdId).then((draft) => {
          if (peekBoxDraftCache(householdId)) return;
          if (draft?.lineItems) setLineItems(draft.lineItems);
        }).catch(() => undefined);
      } else if (!isAuthenticated) {
        setLineItems(useGuestSessionStore.getState().lineItems);
      }
      return;
    }

    setLoading(true);
    const [config, items, kids] = await Promise.all([
      getHanukkahConfig(),
      freshSeed.catalog.length ? Promise.resolve(freshSeed.catalog) : catalogService.getAll(),
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

    const started = Date.now();
    const draft = await boxDraftService.get(householdId);
    const latest = peekBoxDraftCache(householdId);
    if (latest && latest.clientUpdatedAt >= started) setLineItems(latest.lineItems);
    else setLineItems(draft?.lineItems ?? latest?.lineItems ?? []);
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

  const normalizedAddress = (): ShippingAddress => normalizeShippingAddress(address);

  const validateAddress = () => validateShippingAddress(address);

  const subtotal = totalCents(lineItems, boxPriceCents);
  const shippingCents = SHIPPING_FLAT_CENTS;
  const promo = usePromo(subtotal);
  const priced = checkoutTotalsAfterCredit({
    merchandiseCents: subtotal + shippingCents,
    giftCreditCents: household?.giftCreditCents ?? 0,
    platformCreditCents: household?.platformCreditCents ?? 0,
    discountCents: promo.discountCents,
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
    promo,
    discountCents: priced.discountApplied,
    validateAddress,
    normalizedAddress,
  };
}
