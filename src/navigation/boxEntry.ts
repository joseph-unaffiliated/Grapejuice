import { useAuthStore } from '../stores/authStore';
import { useGiftIntentStore } from '../stores/giftIntentStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { usersService } from '../services/firestore/users';
import { navigateMainStack } from './mainStackNavigation';

export type StartOwnBoxBuildRefresh = (options?: { silent?: boolean }) => Promise<void>;

/**
 * Put the visitor into the Hanukkah questionnaire / reveal flow.
 * Guests flip local session flags; signed-in parents clear onboarding/reveal
 * on their profile so the root gate remounts Onboarding after refresh.
 */
export async function startOwnBoxBuild(
  refreshSession?: StartOwnBoxBuildRefresh
): Promise<void> {
  useGiftIntentStore.getState().clear();
  const { isAuthenticated, user } = useAuthStore.getState();

  if (!isAuthenticated || !user?.uid) {
    useGuestSessionStore.getState().startBuildBox();
    return;
  }

  useGuestSessionStore.getState().resetBox();
  await usersService.upsert(user.uid, {
    onboardingComplete: false,
    boxRevealComplete: false,
  });
  await refreshSession?.({ silent: true });
}

export type OpenBoxSurfaceOptions = {
  leave?: () => void;
  /**
   * When false, start the questionnaire instead of opening an empty My Box.
   * Omit when unknown — falls back to My Box (legacy).
   */
  hasOwnBox?: boolean;
  refreshSession?: StartOwnBoxBuildRefresh;
};

/**
 * Single entry point for every "your box" CTA — hero, services nav, mobile nav,
 * footer, landings.
 *
 * A guest who hasn't finished the reveal has no box yet, so they go through
 * onboarding. Signed-in parents with no household draft also start a build
 * (gift-only accounts often have onboardingComplete without a box). Everyone
 * else opens My Box. Gift intent is cleared so a stale gift draft can't hijack
 * the box surface.
 *
 * `leave` is the wizard confirm-before-leaving hook — when present it always
 * wins, so a build restart can never slip past the guard.
 */
export function openBoxSurface(
  isAuthenticated: boolean,
  leaveOrOptions?: (() => void) | OpenBoxSurfaceOptions
): void {
  const options: OpenBoxSurfaceOptions =
    typeof leaveOrOptions === 'function'
      ? { leave: leaveOrOptions }
      : leaveOrOptions ?? {};

  useGiftIntentStore.getState().clear();
  if (options.leave) {
    options.leave();
    return;
  }
  if (options.hasOwnBox === false) {
    void startOwnBoxBuild(options.refreshSession);
    return;
  }
  if (!isAuthenticated && !useGuestSessionStore.getState().boxRevealComplete) {
    useGuestSessionStore.getState().startBuildBox();
    return;
  }
  navigateMainStack('MyBox');
}
