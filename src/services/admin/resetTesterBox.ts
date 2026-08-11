import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useUserStatePreviewStore } from '../../stores/userStatePreviewStore';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { boxDraftService } from '../firestore/boxDraft';
import { usersService } from '../firestore/users';

export type ResetTesterBoxResult = {
  /** Signed-in parent will be routed back through onboarding. */
  restartedOnboarding: boolean;
};

/**
 * Admin/dev helper: wipe the current tester’s Hanukkah box so curation can restart.
 * Clears guest + marketplace local state always; for signed-in users also clears
 * Firestore draft + onboarding/reveal flags (kids/account kept).
 */
export async function resetTesterBox(householdId: string | null | undefined): Promise<ResetTesterBoxResult> {
  const user = useAuthStore.getState().user;
  const isAuthenticated = useAuthStore.getState().isAuthenticated;

  useGuestSessionStore.getState().resetBox();
  useMarketplaceCartStore.getState().clear();
  useUserStatePreviewStore.getState().clearPreview();

  if (!isAuthenticated || !user?.uid) {
    return { restartedOnboarding: false };
  }

  if (householdId) {
    try {
      await boxDraftService.clear(householdId, user.uid);
    } catch {
      // Missing draft is fine — still clear profile flags below.
    }
  }

  await usersService.upsert(user.uid, {
    onboardingComplete: false,
    boxRevealComplete: false,
  });

  return { restartedOnboarding: true };
}
