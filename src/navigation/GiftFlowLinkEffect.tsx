import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useGiftIntentStore } from '../stores/giftIntentStore';
import { DEFAULT_GIFT_CHILDREN } from '../screens/gift/giftGiveTypes';
import { navigationRef } from './navigationRef';
import type { MainStackParamList } from './types';
import {
  giftGiveParamsFromDraft,
  readGiftCustomizePathFromWindow,
  readGiftGivePathFromWindow,
  readGiftStepFromWindow,
} from './giftFlowLink';

function ensureGuestCanMountMain(): void {
  const guest = useGuestSessionStore.getState();
  if (
    !useAuthStore.getState().isAuthenticated &&
    !guest.exploreStarted &&
    !guest.onboardingComplete &&
    !guest.boxRevealComplete
  ) {
    guest.startExplore();
  }
}

function navigateGiftGive(params?: MainStackParamList['GiftGive']): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'GiftGive',
    params,
  });
}

function navigateGiftCustomize(params: MainStackParamList['GiftGiverCustomize']): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'GiftGiverCustomize',
    params,
  });
}

/**
 * Web: `/gift/customize` and `/gift/give` deep links.
 * Restores incomplete gift drafts from giftIntentStore after hydrate.
 */
export function GiftFlowLinkEffect() {
  const pendingCustomize = useRef(
    Platform.OS === 'web' ? readGiftCustomizePathFromWindow() : false
  );
  const pendingGive = useRef(Platform.OS === 'web' ? readGiftGivePathFromWindow() : false);
  const hydrated = useGiftIntentStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!pendingCustomize.current && !pendingGive.current) return;
    if (!hydrated) return;

    ensureGuestCanMountMain();

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      if (useGuestSessionStore.getState().buildBoxPath) return;
      clearInterval(id);

      const intent = useGiftIntentStore.getState();
      const draft = intent.status === 'incomplete' ? intent.draft : null;

      if (pendingCustomize.current) {
        pendingCustomize.current = false;
        pendingGive.current = false;
        if (draft?.form && draft.childDrafts) {
          navigateGiftCustomize({
            form: { ...draft.form, giftPath: 'customize' as const },
            childDrafts: draft.childDrafts,
            lineItems: draft.lineItems,
          });
          return;
        }
        // No draft — start the curated path at the kids step.
        navigateGiftGive({
          form: {
            recipientEmail: '',
            giverName: '',
            message: '',
            giftPath: 'customize' as const,
          },
          childDrafts: DEFAULT_GIFT_CHILDREN,
          initialGiftPath: 'customize' as const,
          step: 'kids',
        });
        return;
      }

      if (pendingGive.current) {
        pendingGive.current = false;
        navigateGiftGive(giftGiveParamsFromDraft(draft, readGiftStepFromWindow()));
      }
    }, 50);

    return () => clearInterval(id);
  }, [hydrated]);

  return null;
}
