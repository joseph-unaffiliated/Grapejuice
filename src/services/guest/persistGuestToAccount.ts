import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useAuthFlowStore, authReturnSkipsBoxOnboarding } from '../../stores/authFlowStore';
import { childrenService } from '../firestore/children';
import { usersService } from '../firestore/users';
import { householdsService } from '../firestore/households';
import { boxDraftService } from '../firestore/boxDraft';
import { queuePendingMainNav } from '../../navigation/pendingMainNav';
import { peekPendingAuthReturn, type AuthUser } from '../auth/auth';
import type { BoxLineItem, ChildProfile } from '../../types/pilot';
import type { ChildDraft } from '../../screens/onboarding/BoxIntroScreen';

/** Kids only — adult drafts must never enter `users/{uid}/children` or guest-N remap. */
export function kidDraftsOnly(drafts: ChildDraft[]): ChildDraft[] {
  return drafts.filter((c) => c.role !== 'adult');
}

/** Remap guest-N child ids (and matching slot suffixes) to Firestore child ids. */
export function remapGuestChildIds(lineItems: BoxLineItem[], saved: ChildProfile[]): BoxLineItem[] {
  if (!saved.length) return lineItems;
  return lineItems.map((li) => {
    const fromId = li.childId;
    if (!fromId) return li;
    const m = /^guest-(\d+)$/.exec(fromId);
    if (!m) return li;
    const next = saved[Number(m[1])];
    if (!next) return li;
    const slotId = li.slotId.includes(fromId) ? li.slotId.split(fromId).join(next.id) : li.slotId;
    return { ...li, childId: next.id, slotId };
  });
}

/**
 * Guest persist used to save adult drafts as children[0], then remap guest-0 → adult.
 * Detect that pattern and shift ids so books/gifts land on real kids.
 */
export function repairAdultLeakedAsFirstChild(
  children: ChildProfile[],
  lineItems: BoxLineItem[],
  adultName: string | undefined | null
): { children: ChildProfile[]; lineItems: BoxLineItem[]; dirty: boolean } {
  const name = adultName?.trim().toLowerCase();
  if (!name || children.length < 2) {
    return { children, lineItems, dirty: false };
  }
  const first = children[0];
  const firstName = first?.name?.trim().toLowerCase();
  if (!first || !firstName || firstName !== name) {
    return { children, lineItems, dirty: false };
  }
  const adultId = first.id;
  const referenced = lineItems.some(
    (li) => li.childId === adultId || (adultId.length > 0 && li.slotId.includes(adultId))
  );
  if (!referenced) {
    return { children, lineItems, dirty: false };
  }

  const idMap = new Map<string, string>();
  for (let i = 0; i < children.length - 1; i += 1) {
    idMap.set(children[i]!.id, children[i + 1]!.id);
  }

  const nextLines = lineItems.map((li) => {
    const fromId = li.childId;
    if (!fromId || !idMap.has(fromId)) return li;
    const nextId = idMap.get(fromId)!;
    const slotId = li.slotId.includes(fromId) ? li.slotId.split(fromId).join(nextId) : li.slotId;
    return { ...li, childId: nextId, slotId };
  });

  return { children: children.slice(1), lineItems: nextLines, dirty: true };
}

/** Mark parent past onboarding gates for gift resume — does NOT start a household box. */
async function ensureGiftResumeSkipsOnboarding(user: AuthUser): Promise<void> {
  const existing = await usersService.get(user.uid);
  if (existing?.onboardingComplete) return;
  await usersService.upsert(user.uid, {
    email: user.email,
    displayName: user.displayName,
    role: 'parent',
    onboardingComplete: true,
    boxRevealComplete: false,
  });
}

export async function persistGuestToAccount(user: AuthUser): Promise<void> {
  const guest = useGuestSessionStore.getState();
  // A Google redirect reloads the page, so the store is empty here — fall back to
  // the value stashed in sessionStorage before the redirect.
  const pendingAtStart =
    useAuthFlowStore.getState().pendingReturn ?? peekPendingAuthReturn();
  const giftDraftAtStart = useAuthFlowStore.getState().pendingGiftCustomize;
  const giftGiveAtStart = useAuthFlowStore.getState().pendingGiftGive;
  const giftCustomizeResume = pendingAtStart === 'GiftGiverCustomize' && !!giftDraftAtStart;
  const giftGiveResume = pendingAtStart === 'GiftGive' && !!giftGiveAtStart;
  const giftClaimResume = pendingAtStart === 'GiftClaim';
  const giftResume = giftCustomizeResume || giftGiveResume || giftClaimResume;
  /** Checkout / nav / gift — stay on surface; never start a box for them. */
  const skipBoxOnboarding =
    giftResume || authReturnSkipsBoxOnboarding(pendingAtStart);

  // Do this first — before any stub profile with onboardingComplete: false can win the race.
  if (giftCustomizeResume) {
    await ensureGiftResumeSkipsOnboarding(user);
    queuePendingMainNav({ screen: 'GiftGiverCustomize', params: giftDraftAtStart });
  } else if (giftGiveResume && giftGiveAtStart) {
    await ensureGiftResumeSkipsOnboarding(user);
    queuePendingMainNav({
      screen: 'GiftGive',
      params: {
        form: giftGiveAtStart.form,
        childDrafts: giftGiveAtStart.childDrafts,
        initialGiftPath: giftGiveAtStart.form.giftPath,
        autoStartPayment: true,
      },
    });
  } else if (giftClaimResume) {
    await ensureGiftResumeSkipsOnboarding(user);
    const token = useAuthFlowStore.getState().pendingGiftClaimToken;
    if (token) {
      queuePendingMainNav({ screen: 'GiftClaim', params: { token } });
    }
  } else if (skipBoxOnboarding) {
    await ensureGiftResumeSkipsOnboarding(user);
  }

  const hasGuestData =
    !giftResume &&
    (guest.exploreStarted ||
      guest.buildBoxPath ||
      guest.lineItems.length > 0 ||
      guest.childDrafts.length > 0 ||
      guest.wishlistItemIds.length > 0 ||
      guest.interests.length > 0);

  if (!hasGuestData && !skipBoxOnboarding) {
    return;
  }

  // Own-box signals only — gift resume must not seed a household box or children.
  const guestHasOwnBox =
    !giftResume &&
    (guest.boxRevealComplete ||
      guest.onboardingComplete ||
      guest.lineItems.length > 0);

  let prof = await usersService.get(user.uid);
  if (!prof) {
    prof = await usersService.upsert(user.uid, {
      email: user.email,
      displayName: user.displayName,
      role: 'parent',
      onboardingComplete: guestHasOwnBox || skipBoxOnboarding,
      boxRevealComplete: guestHasOwnBox || skipBoxOnboarding,
    });
  } else if (guestHasOwnBox && (!prof.onboardingComplete || !prof.boxRevealComplete)) {
    prof = await usersService.upsert(user.uid, {
      onboardingComplete: true,
      boxRevealComplete: true,
    });
  } else if (skipBoxOnboarding && !prof.onboardingComplete) {
    prof = await usersService.upsert(user.uid, {
      onboardingComplete: true,
      boxRevealComplete: true,
    });
  }

  let householdId = prof.householdId;
  if (!householdId) {
    const hh = await householdsService.createForOwner(user.uid);
    householdId = hh.id;
    prof = await usersService.upsert(user.uid, { householdId });
  }

  // Guest favorites only live in the session, so carry them onto the household
  // — union, never replace, so an existing account keeps its saves.
  if (guest.wishlistItemIds.length) {
    const household = await householdsService.get(householdId);
    const existing = household?.wishlistItemIds ?? [];
    const added = guest.wishlistItemIds.filter((id) => !existing.includes(id));
    if (added.length) {
      await householdsService.setWishlistItemIds(householdId, [...existing, ...added]);
    }
  }

  let savedChildren: ChildProfile[] = [];
  if (!giftResume && guest.childDrafts.length) {
    // Must match draftsToProfiles / buildDefaultLineItems indexing (kids only).
    // Saving adults here made guest-0 remap to the parent → "One for [adult]" on books.
    const kidDrafts = kidDraftsOnly(guest.childDrafts);
    if (kidDrafts.length) {
      savedChildren = await childrenService.replaceAll(
        user.uid,
        kidDrafts.map((c) => ({
          name: c.name || undefined,
          ageGroup: c.ageGroup,
          birthdate: c.birthdate,
        }))
      );
    }
  }

  if (!giftResume && guest.lineItems.length) {
    const existingDraft = await boxDraftService.get(householdId);
    const shouldSaveGuestDraft =
      !existingDraft?.lineItems?.length ||
      guest.buildBoxPath ||
      guest.boxRevealComplete ||
      guestHasOwnBox;

    if (shouldSaveGuestDraft) {
      const lineItems = remapGuestChildIds(guest.lineItems, savedChildren);
      await boxDraftService.save(householdId, user.uid, lineItems, {
        familiarityLevel: guest.familiarityLevel,
        childInterests: guest.childInterests.length ? guest.childInterests : undefined,
        wrapSelectedItemIds: guest.wrapSelectedItemIds?.length
          ? guest.wrapSelectedItemIds
          : undefined,
      });
    }
  }

  await usersService.upsert(user.uid, {
    familiarityLevel: guest.familiarityLevel,
    ravNotes: guest.ravNotes?.trim() ? guest.ravNotes.trim() : undefined,
    onboardingComplete: guestHasOwnBox
      ? true
      : skipBoxOnboarding
        ? true
        : guest.onboardingComplete || prof.onboardingComplete,
    boxRevealComplete: guestHasOwnBox
      ? true
      : skipBoxOnboarding
        ? true
        : guest.boxRevealComplete || prof.boxRevealComplete,
    notificationsOptIn: guest.interests.includes('passover-2027-notify') ? true : undefined,
    storefrontInterests: guest.interests.length
      ? Array.from(
          new Set([...(prof.storefrontInterests ?? []), ...guest.interests])
        )
      : undefined,
    hiddenHolidays: guest.hiddenHolidays.length ? guest.hiddenHolidays : undefined,
  });

  // Gift path already queued at the top — never overwrite with My Box.
  if (giftResume) {
    return;
  }

  const pending = useAuthFlowStore.getState().pendingReturn;
  if (guestHasOwnBox) {
    if (
      pending !== 'Stay' &&
      pending !== 'Checkout' &&
      pending !== 'GiftClaim' &&
      pending !== 'GiftGiverCustomize' &&
      pending !== 'GiftGive'
    ) {
      queuePendingMainNav({ screen: 'MyBox' });
      if (pending !== 'MyBox') {
        useAuthFlowStore.setState({ pendingReturn: 'MyBox' });
      }
    }
  }

  // Caller resets the guest store after committing the signed-in user so
  // RootNavigator never sees “signed out + empty guest” mid-transition.
}
