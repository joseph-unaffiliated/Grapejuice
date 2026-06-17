import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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
import { SessionProvider, useSession } from '../context/SessionContext';
import { ActiveProfileProvider, useActiveProfile } from '../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../constants/pilotFeatures';
import { semanticColors } from '../constants/theme';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { DevPreviewEffect } from './DevPreviewEffect';
import { readDevPreviewFromWindow } from './devPreview';
import { WebBrowserHistoryBridge } from './WebBrowserHistoryBridge';
import { GiftClaimLinkEffect } from './GiftClaimLinkEffect';
import { onWebNavigationStateChange } from './webBrowserHistory';

const Stack = createStackNavigator<RootStackParamList>();

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

  const booting = authLoading || !guestHydrated || (isAuthenticated && sessionLoading);

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={semanticColors.brand} />
      </View>
    );
  }

  let gateKey: 'auth' | 'onboarding' | 'main' = 'auth';

  if (previewActive && previewGate) {
    gateKey = previewGate;
  } else if (isAuthenticated) {
    const checkoutReturn =
      pendingAuth === 'Checkout' &&
      (guestLineItems.length > 0 || guestBoxRevealComplete || guestOnboardingComplete);
    if (checkoutReturn) {
      gateKey = 'main';
    } else {
      gateKey = needsOnboarding ? 'onboarding' : needsBoxReveal ? 'onboarding' : 'main';
    }
  } else if (pendingAuth) {
    gateKey = 'auth';
  } else if (buildBoxPath && !guestBoxRevealComplete) {
    gateKey = 'onboarding';
  } else if (exploreStarted || guestOnboardingComplete || guestBoxRevealComplete) {
    gateKey = 'main';
  }

  return (
    <Stack.Navigator key={gateKey} screenOptions={{ headerShown: false }}>
      {!isAuthenticated && gateKey === 'auth' ? (
        <Stack.Screen name="Auth">
          {() => (
            <ThemeProvider mode="parent">
              <AuthStack checkoutAuth={!!pendingAuth} />
            </ThemeProvider>
          )}
        </Stack.Screen>
      ) : gateKey === 'onboarding' ? (
        <Stack.Screen name="Onboarding">
          {() => (
            <ThemeProvider mode="parent">
              <OnboardingStack
                isGuest={!isAuthenticated}
                revealOnly={isAuthenticated && needsBoxReveal && !needsOnboarding}
                initialStep={useDevPreviewStore.getState().onboardingInitialStep ?? undefined}
                onComplete={refresh}
              />
            </ThemeProvider>
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Main" component={MainGate} />
      )}
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => initialize(), [initialize]);

  return (
    <SessionProvider>
      <ActiveProfileProvider>
        <NavigationContainer
          ref={navigationRef}
          onStateChange={onWebNavigationStateChange}
        >
          <WebBrowserHistoryBridge />
          <GiftClaimLinkEffect />
          <DevPreviewEffect />
          <RootRoutes />
        </NavigationContainer>
      </ActiveProfileProvider>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semanticColors.bgPrimary },
});
