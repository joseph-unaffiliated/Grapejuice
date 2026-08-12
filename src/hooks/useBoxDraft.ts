import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { boxDraftService } from '../services/firestore/boxDraft';
import { catalogService } from '../services/firestore/catalog';
import { childrenService } from '../services/firestore/children';
import { buildDefaultLineItems } from '../services/box/buildDefaultBox';
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

export function useBoxDraft() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { household, profile, loading: sessionLoading } = useSession();
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestFamiliarity = useGuestSessionStore((s) => s.familiarityLevel);
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const setGuestLineItems = useGuestSessionStore((s) => s.setLineItems);

  const [lineItems, setLineItems] = useState<BoxLineItem[]>([]);
  const [slotVotes, setSlotVotes] = useState<SlotVotes>(emptySlotVotes());
  const [sealedSectionIds, setSealedSectionIds] = useState<BoxDraft['sealedSectionIds']>();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>('moderate');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      const kids = draftsToProfiles(guestDrafts);
      setChildren(kids);
      setFamiliarity(guestFamiliarity);
      setSlotVotes(emptySlotVotes());
      setSealedSectionIds(undefined);
      // Guests without a started/revealed box should not carry a default box draft —
      // marketplace shopping uses marketplaceCartStore instead.
      const guestHasBox = guestOnboardingComplete || guestBoxRevealComplete;
      if (!guestHasBox) {
        if (guestLineItems.length) setGuestLineItems([]);
        setLineItems([]);
      } else {
        setLineItems(guestLineItems);
      }
      setLoading(false);
      return;
    }

    if (!household?.id || !user?.uid) {
      setLoading(sessionLoading);
      return;
    }

    setLoading(true);
    const [draft, catalog, kids] = await Promise.all([
      boxDraftService.get(household.id),
      catalogService.getAll(),
      childrenService.list(user.uid),
    ]);
    setChildren(kids);
    setFamiliarity(profile?.familiarityLevel ?? draft?.familiarityLevel ?? 'moderate');
    setSlotVotes(draft?.slotVotes ?? emptySlotVotes());
    setSealedSectionIds(draft?.sealedSectionIds);
    if (draft?.lineItems?.length) {
      setLineItems(draft.lineItems);
    } else if (profile?.onboardingComplete && profile?.boxRevealComplete && catalog.length) {
      // Only seed a default box after a real reveal — not for “explore without building.”
      setLineItems(
        buildDefaultLineItems(catalog, kids, draft?.childInterests ?? [])
      );
    } else {
      setLineItems([]);
    }
    setLoading(false);
  }, [
    isAuthenticated,
    household?.id,
    user?.uid,
    profile?.familiarityLevel,
    profile?.onboardingComplete,
    profile?.boxRevealComplete,
    guestDrafts,
    guestFamiliarity,
    guestLineItems,
    guestOnboardingComplete,
    guestBoxRevealComplete,
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
      await boxDraftService.save(household.id, user.uid, next, {
        familiarityLevel: profile?.familiarityLevel ?? familiarity,
        slotVotes,
      });
    },
    [isAuthenticated, household?.id, user?.uid, profile?.familiarityLevel, familiarity, slotVotes, setGuestLineItems]
  );

  const persistSlotVotes = useCallback(
    async (next: SlotVotes) => {
      setSlotVotes(next);
      if (!isAuthenticated || !household?.id || !user?.uid) return;
      await boxDraftService.saveSlotVotes(household.id, user.uid, next);
    },
    [isAuthenticated, household?.id, user?.uid]
  );

  return {
    lineItems,
    slotVotes,
    sealedSectionIds,
    children,
    familiarity,
    loading: loading || (isAuthenticated && sessionLoading),
    isGuest: !isAuthenticated,
    persist,
    persistSlotVotes,
    refresh: load,
  };
}
