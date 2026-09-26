import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { useBoxPresenceStore } from '../stores/boxPresenceStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { boxDraftService } from '../services/firestore/boxDraft';
import { catalogService } from '../services/firestore/catalog';
import { childrenService } from '../services/firestore/children';
import { repairAdultLeakedAsFirstChild, remapGuestChildIds } from '../services/guest/persistGuestToAccount';
import {
  EXTRA_FLAT_CENTS,
  repairExtraPerKidPricing,
  repairWoodDreidelHouseholdQty,
  repairWoodDreidelIncluded,
} from '../services/box/buildDefaultBox';
import { syncWrappingPaperUnitCentsForWrapSelection } from '../components/box/boxLineDisplay';
import { emptySlotVotes } from '../services/box/slotVotes';
import type { BoxLineItem, BoxDraft, ChildProfile, FamiliarityLevel, SlotVotes } from '../types/pilot';
import type { ChildDraft } from '../screens/onboarding/ChildrenScreen';

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
};

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

export function useBoxDraft() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { household, profile, loading: sessionLoading } = useSession();
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestFamiliarity = useGuestSessionStore((s) => s.familiarityLevel);
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const guestWrapSelectedItemIds = useGuestSessionStore((s) => s.wrapSelectedItemIds);
  const setGuestLineItems = useGuestSessionStore((s) => s.setLineItems);
  const setGuestWrapSelectedItemIds = useGuestSessionStore((s) => s.setWrapSelectedItemIds);

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
  const [loading, setLoading] = useState(() => !cached);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      clearAuthBoxDraftCache();
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
        let lines = guestLineItems;
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
          lines = syncWrappingPaperUnitCentsForWrapSelection(
            lines,
            catalog,
            wrapIds.length,
            EXTRA_FLAT_CENTS
          );
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
      setLoading(sessionLoading);
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
      setLoading(false);
    } else {
      setLoading(true);
    }

    const [draft, catalog, kids] = await Promise.all([
      boxDraftService.get(household.id),
      catalogService.getAll(),
      childrenService.list(user.uid),
    ]);

    let nextKids = kids;
    let nextLines = draft?.lineItems?.length ? draft.lineItems : [];

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
          await boxDraftService.save(household.id, user.uid, nextLines, {
            familiarityLevel: profile?.familiarityLevel ?? draft?.familiarityLevel,
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

    const repaired = repairAdultLeakedAsFirstChild(
      nextKids,
      nextLines,
      user.displayName ?? profile?.displayName
    );
    if (repaired.dirty) {
      nextKids = repaired.children;
      nextLines = repaired.lineItems;
      try {
        await childrenService.replaceAll(
          user.uid,
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
        await boxDraftService.save(household.id, user.uid, nextLines, {
          familiarityLevel: profile?.familiarityLevel ?? draft?.familiarityLevel,
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

    const wrapIds = draft?.wrapSelectedItemIds ?? [];
    const beforeWrap = nextLines;
    nextLines = syncWrappingPaperUnitCentsForWrapSelection(
      nextLines,
      catalog,
      wrapIds.length,
      EXTRA_FLAT_CENTS
    );
    const wrapDirty = nextLines !== beforeWrap;

    if (repairedWood.dirty || repairedWoodIncluded.dirty || repairedBooks.dirty || wrapDirty) {
      try {
        await boxDraftService.save(household.id, user.uid, nextLines, {
          familiarityLevel: profile?.familiarityLevel ?? draft?.familiarityLevel,
          childInterests: draft?.childInterests,
          slotVotes: draft?.slotVotes,
          wrapSelectedItemIds: draft?.wrapSelectedItemIds,
          sealedSectionIds: draft?.sealedSectionIds,
        });
      } catch (e) {
        console.warn('[box] failed to persist box line repairs', e);
      }
    }

    setChildren(nextKids);
    setFamiliarity(profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate');
    setSlotVotes(draft?.slotVotes ?? emptySlotVotes());
    setSealedSectionIds(draft?.sealedSectionIds);
    setWrapSelectedItemIds(wrapIds);
    setLineItems(nextLines);
    writeAuthBoxDraftCache({
      householdId: household.id,
      lineItems: nextLines,
      slotVotes: draft?.slotVotes ?? emptySlotVotes(),
      sealedSectionIds: draft?.sealedSectionIds,
      wrapSelectedItemIds: wrapIds,
      children: nextKids,
      familiarity: profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate',
    });
    useBoxPresenceStore.getState().setHasBox(household.id, nextLines.length > 0);
    setLoading(false);
  }, [
    isAuthenticated,
    household?.id,
    user?.uid,
    user?.displayName,
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

  return {
    lineItems,
    slotVotes,
    sealedSectionIds,
    wrapSelectedItemIds,
    children,
    familiarity,
    loading: loading || (isAuthenticated && sessionLoading),
    isGuest: !isAuthenticated,
    persist,
    persistSlotVotes,
    persistWrapSelection,
    refresh: load,
  };
}
