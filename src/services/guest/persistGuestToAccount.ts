import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { childrenService } from '../firestore/children';
import { usersService } from '../firestore/users';
import { householdsService } from '../firestore/households';
import { boxDraftService } from '../firestore/boxDraft';
import { queuePendingMainNav } from '../../navigation/pendingMainNav';
import { peekPendingAuthReturn, type AuthUser } from '../auth/auth';
import type { BoxLineItem, ChildProfile } from '../../types/pilot';

/** Remap guest-N child ids (and matching slot suffixes) to Firestore child ids. */
function remapGuestChildIds(lineItems: BoxLineItem[], saved: ChildProfile[]): BoxLineItem[] {
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
  /** Nav sign in/up — the user stays on their page, so never start a box for them. */
  const inPlaceAuth = pendingAtStart === 'Stay';

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
  }

  const hasGuestData =
    !giftResume &&
    (guest.exploreStarted ||
      guest.buildBoxPath ||
      guest.lineItems.length > 0 ||
      guest.childDrafts.length > 0 ||
      guest.wishlistItemIds.length > 0);

  if (!hasGuestData && !giftResume && !inPlaceAuth) {
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
      onboardingComplete: guestHasOwnBox || giftResume || inPlaceAuth,
      boxRevealComplete: guestHasOwnBox || inPlaceAuth,
    });
  } else if (guestHasOwnBox && (!prof.onboardingComplete || !prof.boxRevealComplete)) {
    prof = await usersService.upsert(user.uid, {
      onboardingComplete: true,
      boxRevealComplete: true,
    });
  } else if ((giftResume || inPlaceAuth) && !prof.onboardingComplete) {
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
    savedChildren = await childrenService.replaceAll(
      user.uid,
      guest.childDrafts.map((c) => ({ name: c.name || undefined, ageGroup: c.ageGroup }))
    );
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
    onboardingComplete: guestHasOwnBox
      ? true
      : giftResume
        ? true
        : guest.onboardingComplete || prof.onboardingComplete,
    boxRevealComplete: guestHasOwnBox
      ? true
      : giftResume
        ? true
        : guest.boxRevealComplete || prof.boxRevealComplete,
    notificationsOptIn: guest.interests.includes('passover-2027-notify') ? true : undefined,
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
