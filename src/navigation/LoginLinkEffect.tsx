import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { navigationRef } from './navigationRef';
import { navigateMainStack } from './mainStackNavigation';
import { navigateToAppPath } from './webBrowserHistory';
import {
  CONNECT_GOOGLE_PATH,
  SET_PASSWORD_PATH,
  readAccountConvertPathFromBoot,
  readLoginLinkFromBoot,
  scrubLoginUrl,
} from './loginLink';
import { redeemLoginLink, type RedeemLoginLinkResult } from '../services/auth/loginLinks';
import { applyGuestSnapshot } from '../services/guest/guestSessionSync';
import { BrandLoadingMark } from '../components/brand/BrandLoadingMark';
import { semanticColors } from '../constants/theme';

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

/** After sign-in the root gate remounts Main and AuthReturnHandler settles; then navigate. */
function whenMainSettled(): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      const root = navigationRef.isReady() ? navigationRef.getRootState()?.routes?.[0]?.name : null;
      const settled = root === 'Main' && useAuthFlowStore.getState().pendingReturn == null;
      if (settled || attempts > 160) {
        clearInterval(id);
        resolve();
      }
    }, 50);
  });
}

function failedLinkMessage(status: Exclude<RedeemLoginLinkResult['status'], 'ok'>): string {
  if (status === 'used') return 'That login link was already used. Enter your email and we’ll send a new one.';
  if (status === 'expired') return 'That login link has expired. Enter your email and we’ll send a new one.';
  return 'That login link didn’t work. Enter your email and we’ll send a new one.';
}

/**
 * Web: `/login?token=…&next=…` from a login-link email → sign in, restore the box the link was
 * minted for (when this browser doesn't already hold one), then route by `next`. A bare `/login`
 * opens email sign-in. Also handles cold `/account/set-password` and `/account/connect-google`.
 */
export function LoginLinkEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signInWithToken = useAuthStore((s) => s.signInWithToken);
  const startAuthFromGuest = useAuthFlowStore((s) => s.startAuthFromGuest);
  const pendingLink = useRef(readLoginLinkFromBoot());
  const pendingConvert = useRef(readAccountConvertPathFromBoot());
  const [working, setWorking] = useState(() => !!pendingLink.current?.token);

  useEffect(() => {
    const link = pendingLink.current;
    if (!link || authLoading) return;
    pendingLink.current = null;
    scrubLoginUrl();

    if (!link.token) {
      if (!isAuthenticated) {
        void whenNavigationReady().then(() => startAuthFromGuest('Stay', 'signin', 'SignInEmail'));
      }
      return;
    }

    void (async () => {
      let result: RedeemLoginLinkResult;
      try {
        result = await redeemLoginLink(link.token!);
      } catch {
        result = { status: 'invalid' };
      }
      await whenNavigationReady();
      if (result.status !== 'ok') {
        setWorking(false);
        if (!isAuthenticated) {
          startAuthFromGuest('Stay', 'signin', 'SignInEmail');
          useAuthStore.setState({ error: failedLinkMessage(result.status) });
        }
        return;
      }

      const next = result.next ?? link.next;
      // Same browser usually still holds the box; another device gets the saved copy.
      if (result.snapshot && !useGuestSessionStore.getState().lineItems.length) {
        applyGuestSnapshot(result.snapshot);
      }
      useGuestSessionStore.getState().setPendingAccountEmail('');
      try {
        await signInWithToken(result.customToken);
      } catch {
        setWorking(false);
        startAuthFromGuest('Stay', 'signin', 'SignInEmail');
        useAuthStore.setState({ error: failedLinkMessage('invalid') });
        return;
      }
      await whenMainSettled();
      setWorking(false);
      if (next === SET_PASSWORD_PATH) navigateMainStack('SetPassword');
      else if (next === CONNECT_GOOGLE_PATH) navigateMainStack('ConnectGoogle');
      else if (next === '/box') navigateMainStack('MyBox');
      else if (next) navigateToAppPath(next);
    })();
  }, [authLoading, isAuthenticated, signInWithToken, startAuthFromGuest]);

  useEffect(() => {
    const screen = pendingConvert.current;
    if (!screen || authLoading) return;
    pendingConvert.current = null;
    void whenNavigationReady().then(() => {
      if (isAuthenticated) navigateMainStack(screen);
      else startAuthFromGuest('Account', 'signin', 'SignInEmail');
    });
  }, [authLoading, isAuthenticated, startAuthFromGuest]);

  if (!working) return null;
  return (
    <View style={styles.overlay} accessibilityLabel="Signing you in" accessibilityRole="progressbar">
      <BrandLoadingMark />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
    zIndex: 2000,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.bgPrimary,
  },
});
