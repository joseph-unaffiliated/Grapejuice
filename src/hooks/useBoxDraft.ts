import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { useBoxPresenceStore } from '../stores/boxPresenceStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { boxDraftService } from '../services/firestore/boxDraft';
import { catalogService } from '../services/firestore/catalog';
import { childrenService } from '../services/firestore/children';
import { withAuthRetry } from '../services/firestore/token';
import { Sentry } from '../services/monitoring/sentry';
import { repairAdultLeakedAsFirstChild, remapGuestChildIds } from '../services/guest/persistGuestToAccount';
import {
  EXTRA_FLAT_CENTS,
  repairExtraPerKidPricing,
  repairWoodDreidelHouseholdQty,
  repairWoodDreidelIncluded,
  repairZeroExtraUnits,
} from '../services/box/buildDefaultBox';
import { retireLegacyBoxLines } from '../services/box/legacyCatalogIds';
import { syncWrappingPaperUnitCentsForWrapSelection } from '../components/box/boxLineDisplay';
import { emptySlotVotes } from '../services/box/slotVotes';
import {
  isCatalogItemSoldOut,
  mergeSwapNotices,
  reconcileSoldOutLines,
} from '../services/box/soldOutReconcile';
import { ordersService } from '../services/firestore/orders';
import type {
  BoxLineItem,
  BoxDraft,
  ChildProfile,
  FamiliarityLevel,
  InventorySwapNotice,
  SlotVotes,
} from '../types/pilot';
import type { ChildDraft } from '../components/family/familyDraft';

function draftsToProfiles(drafts: ChildDraft[]): ChildProfile[] {
  return drafts
    .filter((d) => d.role !== 'adult')
    .map((d, i) => ({
      id: `guest-${i}`,
      name: d.name || undefined,
      ageGroup: d.ageGroup,
      birthdate: d.birthdate,
      plannerAge: d.plannerAge,
    }));
}

function adultCountFromDrafts(drafts: ChildDraft[]): number | undefined {
  const n = drafts.filter((d) => d.role === 'adult').length;
  return n > 0 ? n : undefined;
}

/** Shared across hook instances so Home doesn't reflash empty draft after RootRoutes boot. */
type AuthBoxDraftSnapshot = {
  householdId: string;
  lineItems: BoxLineItem[];
  slotVotes: SlotVotes;
  sealedSectionIds: BoxDraft['sealedSectionIds'];
  wrapSelectedItemIds: string[];
  children: ChildProfile[];
  familiarity: FamiliarityLevel;
  swapNotices: InventorySwapNotice[];
};

const SECURED_BOX_STATUSES = new Set<string>(['pending', 'committed', 'confirmed', 'shipped', 'delivered']);

let authBoxDraftCache: AuthBoxDraftSnapshot | null = null;

function peekAuthBoxDraft(householdId: string | null | undefined): AuthBoxDraftSnapshot | null {
  if (!householdId || authBoxDraftCache?.householdId !== householdId) return null;
  return authBoxDraftCache;
}

function writeAuthBoxDraftCache(snapshot: AuthBoxDraftSnapshot) {
  authBoxDraftCache = snapshot;
}

function clearAuthBoxDraftCache() {
  authBoxDraftCache = null;
}

/** Wipe the in-memory signed-in draft snapshot (e.g. after abandoning a box). */
export function clearBoxDraftCache() {
  clearAuthBoxDraftCache();
}

type AuthBoxDraftLoadArgs = {
  householdId: string;
  uid: string;
  displayName: string | null | undefined;
  profileFamiliarity: FamiliarityLevel | undefined;
};

/** Fetch + repair the signed-in draft (repairs persist once, not once per hook instance). */
async function fetchAuthBoxDraft({
  householdId,
  uid,
  displayName,
  profileFamiliarity,
}: AuthBoxDraftLoadArgs): Promise<AuthBoxDraftSnapshot> {
  const [draft, catalog, kids] = await Promise.all([
    withAuthRetry(uid, () => boxDraftService.get(householdId)),
    catalogService.getAll(),
    childrenService.list(uid),
  ]);

  let nextKids = kids;
  const retired = retireLegacyBoxLines(draft?.lineItems?.length ? draft.lineItems : []);
  let nextLines = retired.lineItems;

  // Leftover guest-N ids after account create — remap so gifts/books count for kids.
  const hadGuestIds = nextLines.some((li) => {
    const id = li.childId || '';
    return /^guest-\d+$/.test(id) || /guest-\d+/.test(li.slotId);
  });
  if (hadGuestIds && nextKids.length) {
    const remapped = remapGuestChildIds(nextLines, nextKids);
    const changed = remapped.some(
      (li, i) => li.childId !== nextLines[i]?.childId || li.slotId !== nextLines[i]?.slotId
    );
    if (changed) {
      nextLines = remapped;
      try {
        await boxDraftService.save(householdId, uid, nextLines, {
          familiarityLevel: profileFamiliarity ?? draft?.familiarityLevel,
          childInterests: draft?.childInterests,
          slotVotes: draft?.slotVotes,
          wrapSelectedItemIds: draft?.wrapSelectedItemIds,
          sealedSectionIds: draft?.sealedSectionIds,
        });
      } catch (e) {
        console.warn('[box] failed to persist guest-id remap', e);
      }
    }
  }

  const repaired = repairAdultLeakedAsFirstChild(nextKids, nextLines, displayName);
  if (repaired.dirty) {
    nextKids = repaired.children;
    nextLines = repaired.lineItems;
    try {
      await childrenService.replaceAll(
        uid,
        nextKids.map((c) => ({
          name: c.name,
          ageGroup: c.ageGroup,
          birthdate: c.birthdate,
          hebrewName: c.hebrewName,
          barMitzvahDate: c.barMitzvahDate,
          beamStatus: c.beamStatus,
          ravEnabled: c.ravEnabled,
        }))
      );
      await boxDraftService.save(householdId, uid, nextLines, {
        familiarityLevel: profileFamiliarity ?? draft?.familiarityLevel,
        childInterests: draft?.childInterests,
        slotVotes: draft?.slotVotes,
        wrapSelectedItemIds: draft?.wrapSelectedItemIds,
        sealedSectionIds: draft?.sealedSectionIds,
      });
    } catch (e) {
      console.warn('[box] failed to persist adult-as-child repair', e);
    }
  }

  const repairedWood = repairWoodDreidelHouseholdQty(nextLines, nextKids);
  if (repairedWood.dirty) nextLines = repairedWood.lineItems;

  const repairedBooks = repairExtraPerKidPricing(nextLines, catalog);
  if (repairedBooks.dirty) nextLines = repairedBooks.lineItems;

  const repairedWoodIncluded = repairWoodDreidelIncluded(nextLines, catalog);
  if (repairedWoodIncluded.dirty) nextLines = repairedWoodIncluded.lineItems;

  const repairedExtraUnits = repairZeroExtraUnits(nextLines, catalog);
  if (repairedExtraUnits.dirty) nextLines = repairedExtraUnits.lineItems;

  let swapNotices = draft?.inventorySwapNotices ?? [];
  let soldOutDirty = false;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  if (nextLines.some((li) => isCatalogItemSoldOut(byId.get(li.itemId)))) {
    // A secured box's order holds its own units — only unsecured drafts get swapped.
    const orders = await ordersService.listForHousehold(householdId).catch(() => null);
    const secured =
      orders == null ||
      orders.some(
        (o) =>
          SECURED_BOX_STATUSES.has(o.status) && o.orderType !== 'marketplace' && o.orderType !== 'received_gift'
      );
    if (!secured) {
      const swapped = reconcileSoldOutLines(nextLines, catalog, nextKids);
      if (swapped.notices.length) {
        nextLines = swapped.lines;
        swapNotices = mergeSwapNotices(swapNotices, swapped.notices);
        soldOutDirty = true;
      }
    }
  }

  const wrapIds = draft?.wrapSelectedItemIds ?? [];
  const beforeWrap = nextLines;
  nextLines = syncWrappingPaperUnitCentsForWrapSelection(
    nextLines,
    catalog,
    wrapIds.length,
    EXTRA_FLAT_CENTS
  );
  const wrapDirty = nextLines !== beforeWrap;

  if (
    retired.dirty ||
    repairedWood.dirty ||
    repairedWoodIncluded.dirty ||
    repairedBooks.dirty ||
    wrapDirty ||
    soldOutDirty
  ) {
    try {
      await boxDraftService.save(householdId, uid, nextLines, {
        familiarityLevel: profileFamiliarity ?? draft?.familiarityLevel,
        childInterests: draft?.childInterests,
        slotVotes: draft?.slotVotes,
        wrapSelectedItemIds: draft?.wrapSelectedItemIds,
        sealedSectionIds: draft?.sealedSectionIds,
      });
      if (soldOutDirty) await boxDraftService.saveSwapNotices(householdId, uid, swapNotices);
    } catch (e) {
      console.warn('[box] failed to persist box line repairs', e);
    }
  }

  const snapshot: AuthBoxDraftSnapshot = {
    householdId,
    lineItems: nextLines,
    slotVotes: draft?.slotVotes ?? emptySlotVotes(),
    sealedSectionIds: draft?.sealedSectionIds,
    wrapSelectedItemIds: wrapIds,
    children: nextKids,
    familiarity: profileFamiliarity ?? draft?.familiarityLevel ?? 'moderate',
    swapNotices,
  };
  writeAuthBoxDraftCache(snapshot);
  useBoxPresenceStore.getState().setHasBox(householdId, nextLines.length > 0);
  return snapshot;
}

const TRANSIENT_LOAD_ERROR_CODES = new Set([
  'auth/quota-exceeded',
  'auth/too-many-requests',
  'auth/network-request-failed',
  'permission-denied',
  'unauthenticated',
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
]);

function isTransientLoadError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && TRANSIENT_LOAD_ERROR_CODES.has(code.replace(/^firestore\//, ''));
}

const reportedLoadErrorHouseholds = new Set<string>();

async function fetchAuthBoxDraftWithRetry(args: AuthBoxDraftLoadArgs): Promise<AuthBoxDraftSnapshot> {
  try {
    return await fetchAuthBoxDraft(args);
  } catch (error) {
    if (!isTransientLoadError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 1000));
    return fetchAuthBoxDraft(args);
  }
}

/**
 * One in-flight load per identical set of inputs, shared by every mounted `useBoxDraft()`
 * (product grids, tiles, header…). A changed input still starts a fresh fetch.
 */
const inflightAuthLoads = new Map<string, Promise<AuthBoxDraftSnapshot>>();

function loadAuthBoxDraftShared(
  key: string,
  args: AuthBoxDraftLoadArgs,
  fresh: boolean
): Promise<AuthBoxDraftSnapshot> {
  const existing = inflightAuthLoads.get(key);
  if (existing && !fresh) return existing;
  const promise = fetchAuthBoxDraftWithRetry(args)
    .catch((error: unknown) => {
      if (!reportedLoadErrorHouseholds.has(args.householdId)) {
        reportedLoadErrorHouseholds.add(args.householdId);
        Sentry.captureException(error, { tags: { area: 'box-draft-load' } });
      }
      throw error;
    })
    .finally(() => {
      if (inflightAuthLoads.get(key) === promise) inflightAuthLoads.delete(key);
    });
  inflightAuthLoads.set(key, promise);
  return promise;
}

const refIds = new WeakMap<object, number>();
let nextRefId = 0;

/** Stable id for a store-owned array/object reference, so load keys track identity like hook deps. */
function refId(value: object | null | undefined): number {
  if (!value) return 0;
  let id = refIds.get(value);
  if (id === undefined) {
    id = ++nextRefId;
    refIds.set(value, id);
  }
  return id;
}

export function useBoxDraft() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { household, profile, loading: sessionLoading } = useSession();
  const hasProfile = profile != null;
  const profileHouseholdId = profile?.householdId ?? null;
  const profileRole = profile?.role;
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestFamiliarity = useGuestSessionStore((s) => s.familiarityLevel);
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const guestWrapSelectedItemIds = useGuestSessionStore((s) => s.wrapSelectedItemIds);
  const setGuestLineItems = useGuestSessionStore((s) => s.setLineItems);
  const setGuestWrapSelectedItemIds = useGuestSessionStore((s) => s.setWrapSelectedItemIds);
  const guestSwapNotices = useGuestSessionStore((s) => s.inventorySwapNotices);

  const cached = peekAuthBoxDraft(household?.id);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>(() => cached?.lineItems ?? []);
  const [slotVotes, setSlotVotes] = useState<SlotVotes>(() => cached?.slotVotes ?? emptySlotVotes());
  const [sealedSectionIds, setSealedSectionIds] = useState<BoxDraft['sealedSectionIds']>(
    () => cached?.sealedSectionIds
  );
  const [wrapSelectedItemIds, setWrapSelectedItemIds] = useState<string[]>(
    () => cached?.wrapSelectedItemIds ?? []
  );
  const [children, setChildren] = useState<ChildProfile[]>(() => cached?.children ?? []);
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>(
    () => cached?.familiarity ?? 'moderate'
  );
  const [authSwapNotices, setAuthSwapNotices] = useState<InventorySwapNotice[]>(() => cached?.swapNotices ?? []);
  const [loading, setLoading] = useState(() => !cached);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (options?: { fresh?: boolean }) => {
    if (!isAuthenticated) {
      clearAuthBoxDraftCache();
      setLoadError(false);
      const kids = draftsToProfiles(guestDrafts);
      setChildren(kids);
      setFamiliarity(guestFamiliarity);
      setSlotVotes(emptySlotVotes());
      setSealedSectionIds(undefined);
      setWrapSelectedItemIds(guestWrapSelectedItemIds ?? []);
      // Guests without a started/revealed box should not carry a default box draft —
      // marketplace shopping uses marketplaceCartStore instead.
      const guestHasBox = guestOnboardingComplete || guestBoxRevealComplete;
      if (!guestHasBox) {
        if (guestLineItems.length) setGuestLineItems([]);
        setLineItems([]);
      } else {
        let lines = retireLegacyBoxLines(guestLineItems).lineItems;
        const wrapIds = guestWrapSelectedItemIds ?? [];
        const adults = adultCountFromDrafts(guestDrafts);
        const repairedWood = repairWoodDreidelHouseholdQty(lines, kids, adults);
        if (repairedWood.dirty) lines = repairedWood.lineItems;
        try {
          const catalog = await catalogService.getAll();
          const repairedBooks = repairExtraPerKidPricing(lines, catalog);
          if (repairedBooks.dirty) lines = repairedBooks.lineItems;
          const repairedIncluded = repairWoodDreidelIncluded(lines, catalog);
          if (repairedIncluded.dirty) lines = repairedIncluded.lineItems;
          const repairedExtraUnits = repairZeroExtraUnits(lines, catalog);
          if (repairedExtraUnits.dirty) lines = repairedExtraUnits.lineItems;
          lines = syncWrappingPaperUnitCentsForWrapSelection(
            lines,
            catalog,
            wrapIds.length,
            EXTRA_FLAT_CENTS
          );
          const swapped = reconcileSoldOutLines(lines, catalog, kids);
          if (swapped.notices.length) {
            lines = swapped.lines;
            const store = useGuestSessionStore.getState();
            store.setInventorySwapNotices(mergeSwapNotices(store.inventorySwapNotices, swapped.notices));
          }
        } catch (e) {
          console.warn('[box] guest extra book pricing repair skipped', e);
          const repairedIncluded = repairWoodDreidelIncluded(lines);
          if (repairedIncluded.dirty) lines = repairedIncluded.lineItems;
        }
        if (lines !== guestLineItems) setGuestLineItems(lines);
        setLineItems(lines);
      }
      setLoading(false);
      return;
    }

    if (!household?.id || !user?.uid) {
      // SessionContext sets the profile before the household, and silent refreshes never flip
      // sessionLoading — an unknown draft must not read as an empty one (My Box restarts the build).
      const householdPending =
        !!user?.uid && (!hasProfile || !!profileHouseholdId || profileRole === 'parent');
      setLoading(sessionLoading || householdPending);
      return;
    }

    const seeded = peekAuthBoxDraft(household.id);
    if (seeded) {
      setLineItems(seeded.lineItems);
      setSlotVotes(seeded.slotVotes);
      setSealedSectionIds(seeded.sealedSectionIds);
      setWrapSelectedItemIds(seeded.wrapSelectedItemIds);
      setChildren(seeded.children);
      setFamiliarity(seeded.familiarity);
      setAuthSwapNotices(seeded.swapNotices);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const loadKey = JSON.stringify([
      user.uid,
      household.id,
      user.displayName,
      hasProfile,
      profileHouseholdId,
      profileRole,
      profile?.displayName,
      profile?.familiarityLevel,
      profile?.onboardingComplete,
      profile?.boxRevealComplete,
      sessionLoading,
      guestFamiliarity,
      guestOnboardingComplete,
      guestBoxRevealComplete,
      refId(guestDrafts),
      refId(guestLineItems),
      refId(guestWrapSelectedItemIds),
    ]);
    let snapshot: AuthBoxDraftSnapshot;
    try {
      snapshot = await loadAuthBoxDraftShared(
        loadKey,
        {
          householdId: household.id,
          uid: user.uid,
          displayName: user.displayName ?? profile?.displayName,
          profileFamiliarity: profile?.familiarityLevel,
        },
        options?.fresh === true
      );
    } catch {
      // Keep whatever is on screen (seeded cache); `error` stops My Box reading this as "no box".
      setLoadError(true);
      setLoading(false);
      return;
    }

    setLoadError(false);
    setChildren(snapshot.children);
    setFamiliarity(snapshot.familiarity);
    setSlotVotes(snapshot.slotVotes);
    setSealedSectionIds(snapshot.sealedSectionIds);
    setWrapSelectedItemIds(snapshot.wrapSelectedItemIds);
    setLineItems(snapshot.lineItems);
    setAuthSwapNotices(snapshot.swapNotices);
    setLoading(false);
  }, [
    isAuthenticated,
    household?.id,
    user?.uid,
    user?.displayName,
    hasProfile,
    profileHouseholdId,
    profileRole,
    profile?.displayName,
    profile?.familiarityLevel,
    profile?.onboardingComplete,
    profile?.boxRevealComplete,
    guestDrafts,
    guestFamiliarity,
    guestLineItems,
    guestOnboardingComplete,
    guestBoxRevealComplete,
    guestWrapSelectedItemIds,
    setGuestLineItems,
    sessionLoading,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load({ fresh: true }), [load]);

  const persist = useCallback(
    async (next: BoxLineItem[]) => {
      setLineItems(next);
      if (!isAuthenticated) {
        setGuestLineItems(next);
        return;
      }
      if (!household?.id || !user?.uid) return;
      const prev = peekAuthBoxDraft(household.id);
      writeAuthBoxDraftCache({
        householdId: household.id,
        lineItems: next,
        slotVotes: prev?.slotVotes ?? slotVotes,
        sealedSectionIds: prev?.sealedSectionIds ?? sealedSectionIds,
        wrapSelectedItemIds: prev?.wrapSelectedItemIds ?? wrapSelectedItemIds,
        children: prev?.children ?? children,
        familiarity: prev?.familiarity ?? familiarity,
        swapNotices: prev?.swapNotices ?? authSwapNotices,
      });
      useBoxPresenceStore.getState().setHasBox(household.id, next.length > 0);
      await boxDraftService.save(household.id, user.uid, next, {
        familiarityLevel: profile?.familiarityLevel ?? familiarity,
        slotVotes,
        wrapSelectedItemIds,
      });
    },
    [
      isAuthenticated,
      household?.id,
      user?.uid,
      profile?.familiarityLevel,
      familiarity,
      slotVotes,
      sealedSectionIds,
      wrapSelectedItemIds,
      children,
      authSwapNotices,
      setGuestLineItems,
    ]
  );

  const persistSlotVotes = useCallback(
    async (next: SlotVotes) => {
      setSlotVotes(next);
      if (!isAuthenticated || !household?.id || !user?.uid) return;
      await boxDraftService.saveSlotVotes(household.id, user.uid, next);
    },
    [isAuthenticated, household?.id, user?.uid]
  );

  const persistWrapSelection = useCallback(
    async (next: string[]) => {
      setWrapSelectedItemIds(next);
      if (!isAuthenticated) {
        setGuestWrapSelectedItemIds(next);
        return;
      }
      if (!household?.id || !user?.uid) return;
      await boxDraftService.saveWrapSelection(household.id, user.uid, next);
    },
    [isAuthenticated, household?.id, user?.uid, setGuestWrapSelectedItemIds]
  );

  const dismissSwapNotices = useCallback(async () => {
    if (!isAuthenticated) {
      useGuestSessionStore.getState().setInventorySwapNotices([]);
      return;
    }
    setAuthSwapNotices([]);
    if (!household?.id || !user?.uid) return;
    const prev = peekAuthBoxDraft(household.id);
    if (prev) writeAuthBoxDraftCache({ ...prev, swapNotices: [] });
    await boxDraftService.saveSwapNotices(household.id, user.uid, []);
  }, [isAuthenticated, household?.id, user?.uid]);

  return {
    lineItems,
    slotVotes,
    sealedSectionIds,
    wrapSelectedItemIds,
    children,
    familiarity,
    loading: loading || (isAuthenticated && sessionLoading),
    /** Signed-in draft failed to load (after one retry) — not the same as an empty box. */
    error: loadError,
    isGuest: !isAuthenticated,
    persist,
    persistSlotVotes,
    persistWrapSelection,
    refresh,
    /** Sold-out items swapped out of this box since the shopper last saw the note. */
    swapNotices: isAuthenticated ? authSwapNotices : guestSwapNotices,
    dismissSwapNotices,
  };
}
