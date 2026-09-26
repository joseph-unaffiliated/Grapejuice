import type { ChildDraft } from '../../components/family/familyDraft';
import { childrenService } from '../firestore/children';
import { catalogService } from '../firestore/catalog';
import { boxDraftService } from '../firestore/boxDraft';
import { buildCuratedBox } from './buildDefaultBox';
import { clearBoxDraftCache } from '../../hooks/useBoxDraft';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { curateBox, applyCurateBoxResult } from '../rav/curateBox';
import { representativeAgeForBand, type IntakeAgeGroup } from './boxRules';
import type { BoxLineItem, ChildProfile, FamiliarityLevel } from '../../types/pilot';
import { kidDraftsOnly, remapGuestChildIds } from '../guest/persistGuestToAccount';

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

export type SaveFamilyMembersResult = {
  savedKids: ChildProfile[];
};

/** Persist kids to Firestore (signed-in) and keep full family drafts in the guest store. */
export async function saveFamilyMembers(opts: {
  uid: string | null | undefined;
  members: ChildDraft[];
}): Promise<SaveFamilyMembersResult> {
  const { uid, members } = opts;
  useGuestSessionStore.getState().setChildDrafts(members);

  if (!uid) {
    return { savedKids: draftsToProfiles(members) };
  }

  const kidDrafts = kidDraftsOnly(members);
  const savedKids = await childrenService.replaceAll(
    uid,
    kidDrafts.map((c) => ({
      name: c.name || undefined,
      ageGroup: c.ageGroup,
      birthdate: c.birthdate,
      plannerAge: c.plannerAge,
    }))
  );
  return { savedKids };
}

/**
 * Re-curate the household box from the current family answers.
 * Replaces line items and clears wrap / sealed customizations.
 */
export async function rebuildBoxFromFamily(opts: {
  uid: string;
  householdId: string;
  members: ChildDraft[];
  familiarityLevel: FamiliarityLevel;
  childInterests?: string[];
  ravNotes?: string;
}): Promise<BoxLineItem[]> {
  const { uid, householdId, members, familiarityLevel, childInterests, ravNotes } = opts;
  const { savedKids } = await saveFamilyMembers({ uid, members });

  const catalog = await catalogService.getAll();
  if (!catalog.length) {
    throw new Error('We could not load the product catalog. Please try again.');
  }

  const profiles = draftsToProfiles(members);
  const adults = adultCountFromDrafts(members);
  const interests = childInterests ?? [];
  const curated = buildCuratedBox(catalog, profiles, {
    practice: familiarityLevel,
    adults,
    childInterests: interests,
  });
  let items = curated.lineItems;
  if (!items.length) {
    throw new Error('We could not rebuild a box from the catalog. Please try again later.');
  }

  // Remap temporary guest-* child ids onto persisted kids.
  items = remapGuestChildIds(items, savedKids);
  const guestToSaved = new Map<string, string>();
  profiles.forEach((p, i) => {
    const saved = savedKids[i];
    if (saved) guestToSaved.set(p.id, saved.id);
  });
  curated.deviations = curated.deviations.map((d) => ({
    ...d,
    childId: d.childId ? guestToSaved.get(d.childId) ?? d.childId : d.childId,
    slotId:
      d.childId && guestToSaved.get(d.childId)
        ? d.slotId.replace(d.childId, guestToSaved.get(d.childId)!)
        : d.slotId,
  }));

  try {
    const curateKids = savedKids.map((c) => ({
      id: c.id,
      firstName: c.name,
      age:
        typeof c.plannerAge === 'number' && Number.isFinite(c.plannerAge)
          ? Math.max(0, Math.floor(c.plannerAge))
          : representativeAgeForBand(c.ageGroup as IntakeAgeGroup),
    }));
    const result = await curateBox({
      practiceLevel: familiarityLevel,
      practiceScore: 0,
      kids: curateKids,
      adults,
      interests,
      notes: ravNotes ?? '',
      baseline: items,
      deviations: curated.deviations,
      catalog,
    });
    items = applyCurateBoxResult(items, catalog, result, curated.deviations);
  } catch (err) {
    console.warn('[account] curateBox failed during rebuild', err);
  }

  await boxDraftService.save(householdId, uid, items, {
    familiarityLevel,
    childInterests: interests,
    wrapSelectedItemIds: [],
    sealedSectionIds: [],
    slotVotes: {},
  });
  clearBoxDraftCache();
  useGuestSessionStore.getState().setLineItems(items);
  useGuestSessionStore.getState().setWrapSelectedItemIds([]);

  return items;
}
