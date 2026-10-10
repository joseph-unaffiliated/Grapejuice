import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { navigationRef } from './navigationRef';
import { navigateMainStack } from './mainStackNavigation';
import { navigateToAppPath } from './webBrowserHistory';
import { openBoxSurface } from './boxEntry';
import { GIFT_CUSTOMIZE_PATH, GIFT_GIVE_PATH } from './giftFlowLink';
import { readResumeNextFromBoot, readResumeTokenFromBoot, scrubResumeUrl } from './resumeLink';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { adoptVisitorId } from '../services/guest/visitorId';
import {
  applyGuestSnapshot,
  resumeGuestSessionRemote,
  type ResumeGuestSessionResult,
} from '../services/guest/guestSessionSync';
import { trackMetaCustom } from '../services/analytics/metaPixel';

function whenNavigationReady(): Promise<void> {
  return new Promise((resolve) => {
    if (navigationRef.isReady()) {
      resolve();
      return;
    }
    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      clearInterval(id);
      resolve();
    }, 50);
  });
}

/**
 * Web: `/?resume=<token>` from a guest-box recovery email → restore the saved box into the
 * guest stores and open where they left off (My Box, the gift flow, or the questionnaire).
 *
 * Signed-in visitors go straight to My Box (their account already holds a box). An invalid or
 * expired token falls back to the normal "your box" entry — never an error screen.
 */
export function ResumeLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const pending = useRef(readResumeTokenFromBoot());
  const nextRef = useRef(readResumeNextFromBoot());

  useEffect(() => {
    const token = pending.current;
    const next = nextRef.current;
    if (!token || authLoading) return;
    pending.current = null;
    scrubResumeUrl();

    let cancelled = false;
    (async () => {
      let result: ResumeGuestSessionResult;
      try {
        result = await resumeGuestSessionRemote(token);
      } catch {
        result = { status: 'invalid' };
      }
      await whenNavigationReady();
      if (cancelled) return;

      if (result.status !== 'ok') {
        openBoxSurface(isAuthenticated);
        return;
      }
      if (isAuthenticated) {
        navigateMainStack(next === 'checkout' ? 'Checkout' : 'MyBox');
        return;
      }

      applyGuestSnapshot(result.snapshot);
      adoptVisitorId(result.visitorId);
      trackMetaCustom('ResumeBox');

      const { gift, guest } = result.snapshot;
      const hasBox = guest.boxRevealComplete || guest.lineItems.length > 0;
      if (next === 'checkout' && hasBox) {
        // Same as My Box's checkout button for a signed-out box: create the account, then pay.
        navigateMainStack('MyBox');
        startAuthFromGuest('Checkout', 'signup', 'SignUp');
        return;
      }
      if (gift?.draft && gift.status === 'incomplete') {
        navigateToAppPath(gift.kind === 'customize' ? GIFT_CUSTOMIZE_PATH : GIFT_GIVE_PATH);
        return;
      }
      if (hasBox) {
        navigateMainStack('MyBox');
        return;
      }
      // Questionnaire in progress: `buildBoxPath` + `onboardingStep` in the store resume it.
      if (!guest.buildBoxPath) openBoxSurface(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, startAuthFromGuest]);

  return null;
}
