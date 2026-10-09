import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

/** Mirrors functions/src/adminDashboard.ts — keep in sync. */
export type DashAnswers = {
  hanukkah: number | null;
  hanukkahLevel: string | null;
  jewish: number | null;
};

export type DashLine = {
  itemId: string | null;
  name: string;
  qty: number;
  unitCents: number;
  addOn: boolean;
  child: string | null;
  forHousehold: boolean;
};

export type DashBox = {
  id: string;
  source: 'order' | 'draft';
  orderId: string | null;
  householdId: string;
  customer: string | null;
  email: string | null;
  test: boolean;
  kids: number;
  status: string;
  playthrough: boolean;
  cardOnFile: boolean;
  boxPriceCents: number;
  addOnCents: number;
  subtotalCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  creditCents: number;
  totalCents: number | null;
  updatedAt: string | null;
  committedAt: string | null;
  attribution: string | null;
  /** State ("NY", "ON, Canada") from an address, else the account's IP region. */
  location?: string | null;
  locationFromIp?: boolean;
  /** `location` is known to be outside the US. */
  outsideUs?: boolean;
  answers: DashAnswers;
  lines: DashLine[];
};

export type DashGuest = {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  stage: 'started' | 'answered' | 'built' | 'revealed' | 'gift';
  step: string | null;
  kids: number;
  boxPriceCents: number;
  addOnCents: number;
  answers: DashAnswers;
  source: string | null;
  landingPath: string | null;
  lastPath: string | null;
  converted: boolean;
  convertedAt: string | null;
  leadAt: string | null;
  resumeCount: number;
  saveCount: number;
  gift: { kind: string | null; giverName: string | null; recipientEmail: string | null; items: number } | null;
  /** IP region from the visitor's saves. */
  location?: string | null;
  outsideUs?: boolean;
  lines: DashLine[];
};

export type DashGift = {
  id: string;
  giver: string | null;
  giverEmail: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientAnswers: DashAnswers;
  kind: 'box' | 'credit';
  amountCents: number | null;
  paid: boolean;
  paymentStatus: string | null;
  status: string;
  claimed: boolean;
  checkedOut: boolean;
  checkoutOrders: Array<{ id: string; status: string; totalCents: number | null; createdAt: string | null; playthrough: boolean }>;
  holdingStock: boolean;
  playthrough: boolean;
  test: boolean;
  message: string | null;
  createdAt: string | null;
  /** Ship-to state ("NY", "ON, Canada"). */
  location?: string | null;
  /** The giver's IP region. */
  giverLocation?: string | null;
  /** The giver's IP is outside the US, or (no giver IP) the ship-to is. */
  outsideUs?: boolean;
  lines: DashLine[];
};

export type DashInventoryRow = {
  id: string;
  name: string;
  stock: number | null;
  heldByBoxes: number;
  heldByGifts: number;
  counterAllocated: number;
  directSold: number;
  directReserved: number;
  remaining: number | null;
  /** Missing until the server function with the Shop orders tab is deployed. */
  directCap?: number | null;
  shopStatus?: 'direct' | 'limited' | 'box_only' | 'sold_out';
  shopRemaining?: number | null;
  favorites: number;
  favoritesReal: number;
};

export type DashShopLine = { itemId: string | null; name: string; qty: number; unitCents: number };

/** One storefront (no-box) order. Mirrors functions/src/shopOrders.ts. */
export type DashShopOrder = {
  id: string;
  orderId: string;
  orderNumber: string;
  householdId: string;
  createdAt: string | null;
  paidAt: string | null;
  buyer: string | null;
  email: string | null;
  guest: boolean;
  test: boolean;
  playthrough: boolean;
  status: string;
  paid: boolean;
  abandoned: boolean;
  cancelReason: string | null;
  chargeTiming: 'checkout' | 'lock' | null;
  chargeFailure: string | null;
  lines: DashShopLine[];
  units: number;
  subtotalCents: number | null;
  discountCents: number;
  creditCents: number;
  shippingCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  refundedCents: number;
  promo: string | null;
  attribution: string | null;
  location: string | null;
  fulfillment: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
};

export type DashAdPerson = {
  id: string;
  ad: string;
  account: boolean;
  test: boolean;
  answered: boolean;
  box: boolean;
  purchase: boolean;
  jewish: number | null;
  hanukkah: number | null;
  firstSeen: string | null;
  /** IP country known and not US. */
  outsideUs?: boolean;
};

/** One signed-out box-builder session: which steps it got through. Mirrors functions/src/adminDashboard.ts. */
export type DashFunnelPerson = {
  id: string;
  firstSeen: string | null;
  ad: string;
  test: boolean;
  outsideUs: boolean;
  family: boolean;
  sliders: boolean;
  gateEmail: boolean;
  sawBox: boolean;
  account: boolean;
  anyEmail: boolean;
  card: boolean;
  purchase: boolean;
};

export type GiftFunnelKey =
  | 'start'
  | 'path'
  | 'family'
  | 'email'
  | 'box'
  | 'note'
  | 'send'
  | 'checkout'
  | 'paid'
  | 'claimed';

export type DashGiftFunnelPerson = {
  id: string;
  firstSeen: string | null;
  lastSeen: string | null;
  ad: string;
  test: boolean;
  outsideUs: boolean;
  location: string | null;
  path: 'credit' | 'curated' | null;
  landing: boolean;
  reached: GiftFunnelKey[];
  tracked: boolean;
  signedIn: boolean;
  kids: number | null;
  items: number;
};

export type MetaAdStats = {
  spend: number;
  linkClicks: number;
  landingPageViews: number;
  addToCart: number;
  registrations: number;
  purchases: number;
};

export type BoxesDashboard = {
  generatedAt: string;
  lockAt: string | null;
  counts: {
    households: number;
    drafts: number;
    orders: number;
    giftInvites: number;
    catalogItems: number;
    guestSessions: number;
  };
  mismatches: Array<{ id: string; name: string; computed: number; counter: number }>;
  boxes: DashBox[];
  guests: DashGuest[];
  gifts: DashGift[];
  /** Storefront orders with no box, newest first. Missing until the server function is deployed. */
  shopOrders?: DashShopOrder[];
  inventory: DashInventoryRow[];
  /** Missing until the server function with the By ad tab is deployed. */
  adPeople?: DashAdPerson[];
  funnel?: DashFunnelPerson[];
  giftFunnel?: DashGiftFunnelPerson[];
  /** Meta's per-ad results, keyed by ad name; null when Meta is unreachable. */
  metaByAd?: Record<string, MetaAdStats> | null;
};

export const DASHBOARD_REFRESH_MS = 60_000;

function pageVisible(): boolean {
  if (Platform.OS === 'web' && typeof document !== 'undefined') return document.visibilityState === 'visible';
  return AppState.currentState === 'active';
}

/** Fetches the admin dashboard, then re-fetches every minute while the page is visible. */
export function useBoxesDashboard(enabled: boolean) {
  const [data, setData] = useState<BoxesDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const fn = httpsCallable<void, BoxesDashboard>(functions, 'getAdminBoxesDashboard');
      const res = await fn();
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => {
      if (pageVisible()) void refresh();
    }, DASHBOARD_REFRESH_MS);
    const onVisible = () => {
      if (pageVisible()) void refresh();
    };
    const sub = AppState.addEventListener('change', onVisible);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(timer);
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [enabled, refresh]);

  return { data, error, refreshing, refresh };
}
