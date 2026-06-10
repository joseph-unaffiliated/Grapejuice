import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { childrenService } from '../firestore/children';
import { usersService } from '../firestore/users';
import { householdsService } from '../firestore/households';
import { boxDraftService } from '../firestore/boxDraft';
import type { AuthUser } from '../auth/auth';

export async function persistGuestToAccount(user: AuthUser): Promise<void> {
  const guest = useGuestSessionStore.getState();
  if (!guest.exploreStarted && guest.lineItems.length === 0 && guest.childDrafts.length === 0) {
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

  const kids = guest.childDrafts.length
    ? await childrenService.replaceAll(
        user.uid,
        guest.childDrafts.map((c) => ({ name: c.name || undefined, ageGroup: c.ageGroup }))
      )
    : await childrenService.list(user.uid);

  if (guest.lineItems.length) {
    await boxDraftService.save(householdId, user.uid, guest.lineItems, {
      familiarityLevel: guest.familiarityLevel,
    });
  }

  await usersService.upsert(user.uid, {
    familiarityLevel: guest.familiarityLevel,
    onboardingComplete: guest.onboardingComplete || prof.onboardingComplete,
    boxRevealComplete: guest.boxRevealComplete || prof.boxRevealComplete,
    notificationsOptIn: guest.interests.includes('passover-2027-notify') ? true : undefined,
    hiddenHolidays: guest.hiddenHolidays,
  });

  useGuestSessionStore.getState().reset();
}
