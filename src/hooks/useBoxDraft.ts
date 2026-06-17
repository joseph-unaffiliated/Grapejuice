import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSession } from './useSession';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { boxDraftService } from '../services/firestore/boxDraft';
import { catalogService } from '../services/firestore/catalog';
import { childrenService } from '../services/firestore/children';
import { buildDefaultLineItems } from '../services/box/buildDefaultBox';
import type { ChildInterestId } from '../constants/childInterests';
import { emptySlotVotes } from '../services/box/slotVotes';
import type { BoxLineItem, BoxDraft, ChildProfile, FamiliarityLevel, SlotVotes } from '../types/pilot';
import type { ChildDraft } from '../screens/onboarding/ChildrenScreen';

function draftsToProfiles(drafts: ChildDraft[]): ChildProfile[] {
  return drafts.map((d, i) => ({
    id: `guest-${i}`,
    name: d.name || undefined,
    ageGroup: d.ageGroup,
  }));
}

export function useBoxDraft() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { household, profile, loading: sessionLoading } = useSession();
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const guestFamiliarity = useGuestSessionStore((s) => s.familiarityLevel);
  const guestDrafts = useGuestSessionStore((s) => s.childDrafts);
  const guestChildInterests = useGuestSessionStore((s) => s.childInterests);
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
      if (guestLineItems.length) {
        setLineItems(guestLineItems);
      } else if (guestDrafts.length) {
        const catalog = await catalogService.getAll();
        const items = buildDefaultLineItems(catalog, kids, guestChildInterests);
        setLineItems(items);
        setGuestLineItems(items);
      } else {
        setLineItems([]);
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
    } else if (catalog.length) {
      setLineItems(buildDefaultLineItems(catalog, kids, (draft?.childInterests ?? []) as ChildInterestId[]));
    } else {
      setLineItems([]);
    }
    setLoading(false);
  }, [
    isAuthenticated,
    household?.id,
    user?.uid,
    profile?.familiarityLevel,
    guestDrafts,
    guestFamiliarity,
    guestLineItems,
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
