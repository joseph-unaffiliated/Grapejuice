import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  NavigationIndependentTree,
  DefaultTheme,
} from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createStackNavigator } from '@react-navigation/stack';
import type { RootStackParamList } from './types';
import { AuthStack } from './AuthStack';
import { OnboardingStack } from './OnboardingStack';
import { MainStack } from './MainStack';
import { ThemeProvider } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import type { AuthReturnRoute } from '../stores/authFlowStore';
import { SessionProvider, useSession } from '../context/SessionContext';
import { ActiveProfileProvider, useActiveProfile } from '../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../constants/pilotFeatures';
import { semanticColors } from '../constants/theme';
import { BrandLoadingMark } from '../components/brand/BrandLoadingMark';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { DevPreviewEffect } from './DevPreviewEffect';
import { readDevPreviewFromWindow } from './devPreview';
import { WebBrowserHistoryBridge } from './WebBrowserHistoryBridge';
import { GiftClaimLinkEffect } from './GiftClaimLinkEffect';
import { GiftLandingLinkEffect } from './GiftLandingLinkEffect';
import { LandingLinkEffect } from './LandingLinkEffect';
import { ProductLinkEffect } from './ProductLinkEffect';
import { StorefrontLinkEffect } from './StorefrontLinkEffect';
import { HomeLinkEffect } from './HomeLinkEffect';
import { BoxLinkEffect } from './BoxLinkEffect';
import { onWebNavigationStateChange } from './webBrowserHistory';
import { consumePendingAuthReturn } from '../services/auth/auth';
import { MockFlowBanner } from '../components/storefront/MockFlowBanner';
import {
  currentMainRouteName,
  resetRootToMainScreen,
} from './pendingMainNav';

/** Transparent theme so AuthHeroShell dimmed backdrop shows Main underneath. */
const authOverlayTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
    card: 'transparent',
  },
};

const Stack = createStackNavigator<RootStackParamList>();

function humanizeRoute(name: string): string {
  const map: Record<string, string> = {
    Main: 'Home',
    Auth: 'Sign in',
    Onboarding: 'Welcome',
  };
  if (map[name]) return map[name];
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function AuthResumeMainEffect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const clearPending = useAuthFlowStore((s) => s.clearPending);

  useEffect(() => {
    if (!isAuthenticated || pendingReturn !== 'MyBox') return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (!navigationRef.isReady()) {
        if (attempts > 80) clearInterval(id);
        return;
      }
      if (currentMainRouteName() === 'MyBox') {
        clearPending();
        clearInterval(id);
        return;
      }
      resetRootToMainScreen('MyBox');
      if (attempts > 80) {
        clearPending();
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [isAuthenticated, pendingReturn, clearPending]);

  return null;
}

function MainGate() {
  const { isChildProfile } = useActiveProfile();
  const themeMode = PILOT_PARENT_ONLY || !isChildProfile ? 'parent' : 'kid';
  return (
    <ThemeProvider mode={themeMode}>
      <MainStack />
    </ThemeProvider>
  );
}

function RootRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const { loading: sessionLoading, needsOnboarding, needsBoxReveal, refresh } = useSession();
  const guestHydrated = useGuestSessionStore((s) => s._hasHydrated);
  const exploreStarted = useGuestSessionStore((s) => s.exploreStarted);
  const buildBoxPath = useGuestSessionStore((s) => s.buildBoxPath);
  const guestOnboardingComplete = useGuestSessionStore((s) => s.onboardingComplete);
  const guestBoxRevealComplete = useGuestSessionStore((s) => s.boxRevealComplete);
  const guestLineItems = useGuestSessionStore((s) => s.lineItems);
  const pendingAuth = useAuthFlowStore((s) => s.pendingReturn);
  const previewGate = useDevPreviewStore((s) => s.forceGate);
  const previewActive = readDevPreviewFromWindow() != null;

  const guestHasMainSurface =
    exploreStarted || guestOnboardingComplete || guestBoxRevealComplete;

  /** Keep Main mounted through overlay sign-in so My Box isn't replaced by /store. */
  const stayOnMainForAuthReturn =
    pendingAuth != null && pendingAuth !== 'GiftClaim';

  const booting =
    !guestHydrated ||
    ((authLoading || (isAuthenticated && sessionLoading)) && !stayOnMainForAuthReturn);

  if (booting) {
    return (
      <View style={styles.rootFill}>
        <MockFlowBanner />
        <View style={styles.boot} accessibilityLabel="Loading" accessibilityRole="progressbar">
          <BrandLoadingMark />
        </View>
      </View>
    );
  }

  /** Auth started from storefront / My Box / etc. — keep Main mounted and overlay Auth. */
  const authAsOverlay = !isAuthenticated && !!pendingAuth && guestHasMainSurface;

  let gateKey: 'auth' | 'onboarding' | 'main' = 'auth';

  if (previewActive && previewGate) {
    gateKey = previewGate;
  } else if (isAuthenticated) {
    const guestHasBox =
      guestLineItems.length > 0 || guestBoxRevealComplete || guestOnboardingComplete;
    const resumeMainAfterAuth =
      guestHasBox &&
      pendingAuth != null &&
      pendingAuth !== 'GiftClaim';
    if (resumeMainAfterAuth) {
      // Guest already revealed/customized a box — don't restart onboarding after sign-in.
      gateKey = 'main';
    } else if (exploreStarted && !needsOnboarding) {
      // Signed-in “explore without building a box” — onboarding done, reveal skipped.
      gateKey = 'main';
    } else {
      gateKey = needsOnboarding ? 'onboarding' : needsBoxReveal ? 'onboarding' : 'main';
    }
  } else if (pendingAuth && !guestHasMainSurface) {
    // Cold auth / gift-claim before explore — full Auth stack (no Main underneath).
    gateKey = 'auth';
  } else if (buildBoxPath && !guestBoxRevealComplete) {
    gateKey = 'onboarding';
  } else if (guestHasMainSurface) {
    gateKey = 'main';
  }

  return (
    <View style={styles.rootFill}>
      <MockFlowBanner />
      <View style={styles.gate}>
        <Stack.Navigator key={gateKey} screenOptions={{ headerShown: false }}>
          {!isAuthenticated && gateKey === 'auth' ? (
            <Stack.Screen name="Auth" options={{ title: 'Sign in' }}>
              {() => (
                <ThemeProvider mode="parent">
                  <AuthStack checkoutAuth={!!pendingAuth} />
                </ThemeProvider>
              )}
            </Stack.Screen>
          ) : gateKey === 'onboarding' ? (
            <Stack.Screen name="Onboarding" options={{ title: 'Welcome' }}>
              {() => (
                <ThemeProvider mode="parent">
                  <OnboardingStack
                    isGuest={!isAuthenticated}
                    revealOnly={isAuthenticated && needsBoxReveal && !needsOnboarding}
                    initialStep={useDevPreviewStore.getState().onboardingInitialStep ?? undefined}
                    onComplete={() => {
                      // Silent so finishing reveal/explore doesn't remount Main
                      // via the boot spinner and drop the pending MyBox handoff.
                      void refresh({ silent: true });
                    }}
                  />
                </ThemeProvider>
              )}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Main" component={MainGate} options={{ title: 'Home' }} />
          )}
        </Stack.Navigator>

        {authAsOverlay ? (
          <View style={styles.authOverlay}>
            {/*
              Sibling AuthStack under the root NavigationContainer throws
              "Another navigator is already registered". Independent tree +
              nested container keeps Main mounted and auth navigable.
            */}
            <NavigationIndependentTree>
              <NavigationContainer theme={authOverlayTheme}>
                <ThemeProvider mode="parent">
                  <AuthStack checkoutAuth />
                </ThemeProvider>
              </NavigationContainer>
            </NavigationIndependentTree>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function RootNavigator() {
  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  useEffect(() => initialize(), [initialize]);

  useEffect(() => {
    if (authLoading) return;
    const raw = consumePendingAuthReturn();
    if (!raw) return;
    if (!isAuthenticated) return;
    const allowed: AuthReturnRoute[] = [
      'Checkout',
      'Rav',
      'Account',
      'Profiles',
      'MyBox',
      'GiftClaim',
      'History',
    ];
    if (!allowed.includes(raw as AuthReturnRoute)) return;
    useAuthFlowStore.setState({ pendingReturn: raw as AuthReturnRoute });
  }, [authLoading, isAuthenticated]);

  return (
    <SessionProvider>
      <ActiveProfileProvider>
        <NavigationContainer
          ref={navigationRef}
          onStateChange={onWebNavigationStateChange}
          documentTitle={{
            formatter: (options, route) => {
              const page =
                (typeof options?.title === 'string' && options.title.trim()) ||
                (typeof route?.name === 'string' ? humanizeRoute(route.name) : '');
              if (!page || page === 'Grapejuice') return 'Grapejuice';
              return `Grapejuice | ${page}`;
            },
          }}
        >
          <WebBrowserHistoryBridge />
          <GiftClaimLinkEffect />
          <GiftLandingLinkEffect />
          <LandingLinkEffect />
          <ProductLinkEffect />
          <StorefrontLinkEffect />
          <HomeLinkEffect />
          <BoxLinkEffect />
          <AuthResumeMainEffect />
          <DevPreviewEffect />
          <RootRoutes />
        </NavigationContainer>
      </ActiveProfileProvider>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  rootFill: {
    flex: 1,
  },
  gate: {
    flex: 1,
    position: 'relative',
  },
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.bgPrimary,
  },
});
