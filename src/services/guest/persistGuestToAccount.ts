import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { childrenService } from '../firestore/children';
import { usersService } from '../firestore/users';
import { householdsService } from '../firestore/households';
import { boxDraftService } from '../firestore/boxDraft';
import type { AuthUser } from '../auth/auth';

export async function persistGuestToAccount(user: AuthUser): Promise<void> {
  const guest = useGuestSessionStore.getState();
  const hasGuestData =
    guest.exploreStarted ||
    guest.buildBoxPath ||
    guest.lineItems.length > 0 ||
    guest.childDrafts.length > 0;

  if (!hasGuestData) {
    return;
  }

  let prof = await usersService.get(user.uid);
  if (!prof) {
    prof = await usersService.upsert(user.uid, {
      email: user.email,
      displayName: user.displayName,
      role: 'parent',
      onboardingComplete: false,
    });
  }

  let householdId = prof.householdId;
  if (!householdId) {
    const hh = await householdsService.createForOwner(user.uid);
    householdId = hh.id;
    prof = await usersService.upsert(user.uid, { householdId });
  }

  if (guest.childDrafts.length) {
    await childrenService.replaceAll(
      user.uid,
      guest.childDrafts.map((c) => ({ name: c.name || undefined, ageGroup: c.ageGroup }))
    );
  }

  const reachedCheckout = guest.lineItems.length > 0 || guest.boxRevealComplete || guest.onboardingComplete;

  if (guest.lineItems.length) {
    const existingDraft = await boxDraftService.get(householdId);
    const shouldSaveGuestDraft =
      !existingDraft?.lineItems?.length || guest.buildBoxPath || guest.boxRevealComplete;

    if (shouldSaveGuestDraft) {
      await boxDraftService.save(householdId, user.uid, guest.lineItems, {
        familiarityLevel: guest.familiarityLevel,
        childInterests: guest.childInterests.length ? guest.childInterests : undefined,
      });
    }
  }

  await usersService.upsert(user.uid, {
    familiarityLevel: guest.familiarityLevel,
    onboardingComplete: reachedCheckout ? true : guest.onboardingComplete || prof.onboardingComplete,
    boxRevealComplete: reachedCheckout ? true : guest.boxRevealComplete || prof.boxRevealComplete,
    notificationsOptIn: guest.interests.includes('passover-2027-notify') ? true : undefined,
    hiddenHolidays: guest.hiddenHolidays.length ? guest.hiddenHolidays : undefined,
  });

  useGuestSessionStore.getState().reset();
}
