import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useMarketplaceCartStore } from '../../stores/marketplaceCartStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { useUserStatePreviewStore } from '../../stores/userStatePreviewStore';

/**
 * Start a real visitor playthrough from Test landings: isolate guest state,
 * sign out admin, mark mock flow active. Caller navigates to the landing.
 */
export async function enterVisitorPlaythrough(input: {
  audienceId: string;
  landingLabel: string;
  sourcePath: string;
}): Promise<void> {
  const adminEmail = useAuthStore.getState().user?.email ?? null;
  const wasSignedIn = useAuthStore.getState().isAuthenticated;

  useGuestSessionStore.getState().reset();
  useGuestSessionStore.getState().startExplore();
  useMarketplaceCartStore.getState().clear();
  useUserStatePreviewStore.getState().clearPreview();

  useMockFlowStore.getState().enter({
    audienceId: input.audienceId,
    landingLabel: input.landingLabel,
    sourcePath: input.sourcePath,
    adminEmail,
  });

  if (wasSignedIn) {
    await useAuthStore.getState().logout();
  }
}

/**
 * End playthrough: stash admin email for sign-in prefill, wipe guest + tester
 * session, clear mock chrome. Root then shows cold Auth.
 */
export async function exitVisitorPlaythrough(): Promise<void> {
  const adminEmail =
    useMockFlowStore.getState().restore?.adminEmail ??
    useAuthStore.getState().user?.email ??
    null;

  if (adminEmail) {
    useAuthFlowStore.getState().prepareAdminSignIn(adminEmail);
  } else {
    useAuthFlowStore.getState().clearPending();
  }

  useGuestSessionStore.getState().reset();
  useMarketplaceCartStore.getState().clear();

  if (useAuthStore.getState().isAuthenticated) {
    await useAuthStore.getState().logout();
  }

  useMockFlowStore.getState().exit();
}
