import { useGiftIntentStore } from '../stores/giftIntentStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigateMainStack } from './mainStackNavigation';

/**
 * Single entry point for every "your box" CTA — hero, services nav, mobile nav,
 * footer, landings.
 *
 * A guest who hasn't finished the reveal has no box yet, so they go through
 * onboarding. Everyone else opens My Box directly: the root gate refuses a
 * second build for a guest who already revealed, and that refusal reads as a
 * dead click. Gift intent is cleared so a stale gift draft can't hijack the
 * box surface.
 *
 * `leave` is the wizard confirm-before-leaving hook — when present it always
 * wins, so a build restart can never slip past the guard.
 */
export function openBoxSurface(isAuthenticated: boolean, leave?: () => void): void {
  useGiftIntentStore.getState().clear();
  if (leave) {
    leave();
    return;
  }
  if (!isAuthenticated && !useGuestSessionStore.getState().boxRevealComplete) {
    useGuestSessionStore.getState().startBuildBox();
    return;
  }
  navigateMainStack('MyBox');
}
