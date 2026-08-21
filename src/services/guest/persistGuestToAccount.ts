import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { childrenService } from '../firestore/children';
import { usersService } from '../firestore/users';
import { householdsService } from '../firestore/households';
import { boxDraftService } from '../firestore/boxDraft';
import { queuePendingMainNav } from '../../navigation/pendingMainNav';
import type { AuthUser } from '../auth/auth';
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

/** Mark parent past onboarding so RootNavigator won't dump gift resume into Build a Box. */
async function ensureGiftResumeSkipsOnboarding(user: AuthUser): Promise<void> {
  const existing = await usersService.get(user.uid);
  if (existing?.onboardingComplete && existing?.boxRevealComplete) return;
  await usersService.upsert(user.uid, {
    email: user.email,
    displayName: user.displayName,
    role: 'parent',
    onboardingComplete: true,
    boxRevealComplete: true,
  });
}

export async function persistGuestToAccount(user: AuthUser): Promise<void> {
  const guest = useGuestSessionStore.getState();
  const pendingAtStart = useAuthFlowStore.getState().pendingReturn;
  const giftDraftAtStart = useAuthFlowStore.getState().pendingGiftCustomize;
  const giftResume = pendingAtStart === 'GiftGiverCustomize' && !!giftDraftAtStart;

  // Do this first — before any stub profile with onboardingComplete: false can win the race.
  if (giftResume) {
    await ensureGiftResumeSkipsOnboarding(user);
    queuePendingMainNav({ screen: 'GiftGiverCustomize', params: giftDraftAtStart });
  }

  const hasGuestData =
    guest.exploreStarted ||
    guest.buildBoxPath ||
    guest.lineItems.length > 0 ||
    guest.childDrafts.length > 0;

  if (!hasGuestData) {
    return;
  }

  // Snapshot before any writes — a concurrent session load must not stamp
  // onboardingComplete: false and dump a customized guest back into onboarding.
  const guestHasBox =
    giftResume ||
    guest.boxRevealComplete ||
    guest.onboardingComplete ||
    guest.lineItems.length > 0;

  let prof = await usersService.get(user.uid);
  if (!prof) {
    prof = await usersService.upsert(user.uid, {
      email: user.email,
      displayName: user.displayName,
      role: 'parent',
      onboardingComplete: guestHasBox,
      boxRevealComplete: guestHasBox,
    });
  } else if (guestHasBox && (!prof.onboardingComplete || !prof.boxRevealComplete)) {
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

  let savedChildren: ChildProfile[] = [];
  if (guest.childDrafts.length) {
    savedChildren = await childrenService.replaceAll(
      user.uid,
      guest.childDrafts.map((c) => ({ name: c.name || undefined, ageGroup: c.ageGroup }))
    );
  }

  if (guest.lineItems.length) {
    const existingDraft = await boxDraftService.get(householdId);
    const shouldSaveGuestDraft =
      !existingDraft?.lineItems?.length ||
      guest.buildBoxPath ||
      guest.boxRevealComplete ||
      guestHasBox;

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
    onboardingComplete: guestHasBox ? true : guest.onboardingComplete || prof.onboardingComplete,
    boxRevealComplete: guestHasBox ? true : guest.boxRevealComplete || prof.boxRevealComplete,
    notificationsOptIn: guest.interests.includes('passover-2027-notify') ? true : undefined,
    hiddenHolidays: guest.hiddenHolidays.length ? guest.hiddenHolidays : undefined,
  });

  // Gift path already queued at the top — never overwrite with My Box.
  if (giftResume) {
    return;
  }

  const pending = useAuthFlowStore.getState().pendingReturn;
  if (guestHasBox) {
    if (pending !== 'Checkout' && pending !== 'GiftClaim' && pending !== 'GiftGiverCustomize') {
      queuePendingMainNav({ screen: 'MyBox' });
      if (pending !== 'MyBox') {
        useAuthFlowStore.setState({ pendingReturn: 'MyBox' });
      }
    }
  }

  // Caller resets the guest store after committing the signed-in user so
  // RootNavigator never sees “signed out + empty guest” mid-transition.
}
