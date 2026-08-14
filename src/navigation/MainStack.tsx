import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from './types';
import { WebDesktopFrame } from '../components/layout/WebDesktopFrame';
import { MainTabs } from './MainTabs';
import { MyBoxScreen } from '../screens/main/MyBoxScreen';
import { AlaCarteStoreScreen } from '../screens/main/AlaCarteStoreScreen';
import { CatalogProductScreen } from '../screens/main/CatalogProductScreen';
import { StorefrontHomeScreen } from '../screens/storefront/StorefrontHomeScreen';
import { StorefrontCategoryScreen } from '../screens/storefront/StorefrontCategoryScreen';
import { StorefrontOurStoryScreen } from '../screens/storefront/StorefrontOurStoryScreen';
import { StorefrontPassoverScreen } from '../screens/storefront/StorefrontPassoverScreen';
import { StorefrontCartScreen } from '../screens/storefront/StorefrontCartScreen';
import { BoxDiscountEligibilityScreen } from '../screens/main/BoxDiscountEligibilityScreen';
import { CheckoutScreen } from '../screens/main/CheckoutScreen';
import { OrderConfirmationScreen } from '../screens/main/OrderConfirmationScreen';
import { ReflectionFlowScreen } from '../screens/main/ReflectionFlowScreen';
import { AboutHanukkahScreen } from '../screens/main/AboutHanukkahScreen';
import { HistoryScreen } from '../screens/main/HistoryScreen';
import { GiftGiveScreen } from '../screens/gift/GiftGiveScreen';
import { GiftGiverCustomizeScreen } from '../screens/gift/GiftGiverCustomizeScreen';
import { GiftClaimScreen } from '../screens/gift/GiftClaimScreen';
import { GiftRecipientRevealScreen } from '../screens/gift/GiftRecipientRevealScreen';
import { GiftLandingScreen } from '../screens/landing/GiftLandingScreen';
import { CulturalLandingScreen } from '../screens/landing/CulturalLandingScreen';
import { InterfaithLandingScreen } from '../screens/landing/InterfaithLandingScreen';
import { ConvenienceLandingScreen } from '../screens/landing/ConvenienceLandingScreen';
import { LastMinuteLandingScreen } from '../screens/landing/LastMinuteLandingScreen';
import { ForYourHomeLandingScreen } from '../screens/landing/ForYourHomeLandingScreen';
import { GuideScreen } from '../screens/main/GuideScreen';
import { KidGuideScreen } from '../screens/kids/KidGuideScreen';
import { ProfilesScreen } from '../screens/profiles/ProfilesScreen';
import { GrapeWobblePreviewScreen } from '../screens/dev/GrapeWobblePreviewScreen';
import { AdminCatalogScreen } from '../screens/admin/AdminCatalogScreen';
import { AdminCatalogItemScreen } from '../screens/admin/AdminCatalogItemScreen';
import { AdminLandingsScreen } from '../screens/admin/AdminLandingsScreen';
import { AdminLandingEditorScreen } from '../screens/admin/AdminLandingEditorScreen';
import { PILOT_PARENT_ONLY, PILOT_HIDE_IN_APP_GUIDE } from '../constants/pilotFeatures';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';
import { consumePendingMainNav, peekPendingMainNav } from './pendingMainNav';
import { navigationRef } from './navigationRef';
import { AdminControlPanel } from '../components/storefront/AdminControlPanel';

const Stack = createStackNavigator<MainStackParamList>();

const DEFAULT_MAIN_ROUTE: keyof MainStackParamList =
  Platform.OS === 'web' ? 'StorefrontHome' : 'MainTabs';

/**
 * Prefer onboarding handoff (My Box / leave target) over the web storefront
 * default. Peek only — consume after the stack has mounted on that route.
 */
function readHandoffInitialRoute(): keyof MainStackParamList {
  const pending = peekPendingMainNav();
  if (pending?.screen && !pending.tab) return pending.screen;
  if (useGuestSessionStore.getState().openMyBoxAfterReveal) return 'MyBox';
  return DEFAULT_MAIN_ROUTE;
}

function resetToScreen(
  navigation: StackNavigationProp<MainStackParamList>,
  screen: keyof MainStackParamList,
  params?: object
) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [params ? { name: screen, params } : { name: screen }],
    })
  );
}

function GuestBoxRevealHandler({ alreadyOnMyBox }: { alreadyOnMyBox: boolean }) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const openMyBoxAfterReveal = useGuestSessionStore((s) => s.openMyBoxAfterReveal);
  const consumeOpenMyBoxAfterReveal = useGuestSessionStore((s) => s.consumeOpenMyBoxAfterReveal);

  useEffect(() => {
    if (!openMyBoxAfterReveal) return;
    consumeOpenMyBoxAfterReveal();
    if (alreadyOnMyBox) return;
    resetToScreen(navigation, 'MyBox');
  }, [openMyBoxAfterReveal, consumeOpenMyBoxAfterReveal, navigation, alreadyOnMyBox]);

  return null;
}

/** Applies MainStack destinations queued while the root gate was Onboarding. */
function PendingMainNavHandler({ honoredInitial }: { honoredInitial: keyof MainStackParamList }) {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();

  useEffect(() => {
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (!navigationRef.isReady()) {
        if (attempts > 40) clearInterval(id);
        return;
      }
      const nav = peekPendingMainNav();
      if (!nav) {
        if (attempts > 40) clearInterval(id);
        return;
      }
      // Initial route already matched the handoff — just clear the queue.
      if (!nav.tab && nav.screen === honoredInitial) {
        consumePendingMainNav();
        clearInterval(id);
        return;
      }
      consumePendingMainNav();
      clearInterval(id);
      if (nav.tab) {
        navigation.navigate('MainTabs', {
          screen: nav.tab,
          params: nav.tabParams as never,
        });
        return;
      }
      // Reset so we don't leave StorefrontHome underneath after onboarding.
      resetToScreen(navigation, nav.screen, nav.params as object | undefined);
    }, 50);
    return () => clearInterval(id);
  }, [navigation, honoredInitial]);

  return null;
}

function AuthReturnHandler() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const pendingGiftClaimToken = useAuthFlowStore((s) => s.pendingGiftClaimToken);
  const clearPending = useAuthFlowStore((s) => s.clearPending);

  useEffect(() => {
    if (!isAuthenticated || !pendingReturn) return;
    if (pendingReturn === 'Checkout') {
      clearPending();
      navigation.navigate('Checkout');
      return;
    }
    if (pendingReturn === 'Rav') {
      clearPending();
      navigation.navigate('MainTabs', { screen: 'Rav' });
      return;
    }
    if (pendingReturn === 'Account') {
      clearPending();
      navigation.navigate('MainTabs', { screen: 'Account' });
      return;
    }
    if (pendingReturn === 'Profiles') {
      clearPending();
      if (PILOT_PARENT_ONLY) {
        navigation.navigate('MainTabs', { screen: 'Account' });
      } else {
        navigation.navigate('Profiles');
      }
      return;
    }
    if (pendingReturn === 'MyBox') {
      clearPending();
      navigation.navigate('MyBox');
      return;
    }
    if (pendingReturn === 'GiftClaim') {
      const token = pendingGiftClaimToken;
      clearPending();
      if (token) navigation.navigate('GiftClaim', { token });
      return;
    }
    if (pendingReturn === 'History') {
      clearPending();
      navigation.navigate('History');
    }
  }, [isAuthenticated, pendingReturn, pendingGiftClaimToken, clearPending, navigation]);

  return null;
}

export function MainStack() {
  // Capture once per Main mount (gate switch). Web defaults to storefront unless
  // onboarding queued a handoff — e.g. build splash → My Box.
  const initialRouteName = useRef(readHandoffInitialRoute()).current;
  const pendingAtMount = peekPendingMainNav();
  const initialParams =
    pendingAtMount?.screen === initialRouteName ? pendingAtMount.params : undefined;

  return (
    <WebDesktopFrame>
      <GuestBoxRevealHandler alreadyOnMyBox={initialRouteName === 'MyBox'} />
      <PendingMainNavHandler honoredInitial={initialRouteName} />
      <AuthReturnHandler />
      <AdminControlPanel />
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          ...(Platform.OS === 'web' ? { cardStyle: { overflow: 'visible' as const } } : {}),
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ title: 'Home' }} />
        <Stack.Screen name="MyBox" component={MyBoxScreen} options={{ title: 'My Box' }} />
        <Stack.Screen
          name="StorefrontCart"
          component={StorefrontCartScreen}
          options={{ title: 'Cart' }}
        />
        {!PILOT_HIDE_IN_APP_GUIDE ? (
          <Stack.Screen name="Guide" component={GuideScreen} options={{ title: 'Guide' }} />
        ) : null}
        {!PILOT_PARENT_ONLY ? (
          <>
            <Stack.Screen name="KidGuide" component={KidGuideScreen} options={{ title: 'Guide' }} />
            <Stack.Screen name="Profiles" component={ProfilesScreen} options={{ title: 'Profiles' }} />
          </>
        ) : null}
        <Stack.Screen
          name="AlaCarteStore"
          component={AlaCarteStoreScreen}
          options={{ title: 'À la carte' }}
        />
        <Stack.Screen
          name="StorefrontHome"
          component={StorefrontHomeScreen}
          options={{ title: 'Store' }}
        />
        <Stack.Screen
          name="StorefrontCategory"
          component={StorefrontCategoryScreen}
          options={{ title: 'Store' }}
          initialParams={
            initialRouteName === 'StorefrontCategory'
              ? (initialParams as { category: string; q?: string } | undefined)
              : undefined
          }
        />
        <Stack.Screen
          name="StorefrontOurStory"
          component={StorefrontOurStoryScreen}
          options={{ title: 'Our story' }}
        />
        <Stack.Screen
          name="StorefrontPassover"
          component={StorefrontPassoverScreen}
          options={{ title: 'Passover 2027' }}
        />
        <Stack.Screen
          name="CatalogProduct"
          component={CatalogProductScreen}
          options={{ title: 'Product' }}
        />
        <Stack.Screen
          name="BoxDiscountEligibility"
          component={BoxDiscountEligibilityScreen}
          options={{ title: 'Box discount' }}
        />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
        <Stack.Screen
          name="OrderConfirmation"
          component={OrderConfirmationScreen}
          options={{ title: 'Order confirmed' }}
        />
        <Stack.Screen
          name="Reflection"
          component={ReflectionFlowScreen}
          options={{ title: 'Reflection' }}
        />
        <Stack.Screen
          name="AboutHanukkah"
          component={AboutHanukkahScreen}
          options={{ title: 'About Hanukkah' }}
        />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
        <Stack.Screen
          name="GiftLanding"
          component={GiftLandingScreen}
          options={{ title: 'Give a gift' }}
        />
        <Stack.Screen
          name="CulturalLanding"
          component={CulturalLandingScreen}
          options={{ title: 'Jewish, your way' }}
        />
        <Stack.Screen
          name="InterfaithLanding"
          component={InterfaithLandingScreen}
          options={{ title: 'Interfaith homes' }}
        />
        <Stack.Screen
          name="ConvenienceLanding"
          component={ConvenienceLandingScreen}
          options={{ title: 'Easy delivery' }}
        />
        <Stack.Screen
          name="LastMinuteLanding"
          component={LastMinuteLandingScreen}
          options={{ title: 'Last-minute ready' }}
        />
        <Stack.Screen
          name="ForYourHomeLanding"
          component={ForYourHomeLandingScreen}
          options={{ title: 'For your home' }}
        />
        <Stack.Screen name="GiftGive" component={GiftGiveScreen} options={{ title: 'Give a gift' }} />
        <Stack.Screen
          name="GiftGiverCustomize"
          component={GiftGiverCustomizeScreen}
          options={{ title: 'Customize gift' }}
        />
        <Stack.Screen name="GiftClaim" component={GiftClaimScreen} options={{ title: 'Claim gift' }} />
        <Stack.Screen
          name="GiftRecipientReveal"
          component={GiftRecipientRevealScreen}
          options={{ title: 'Your gift' }}
        />
        <Stack.Screen
          name="AdminCatalog"
          component={AdminCatalogScreen}
          options={{ title: 'Catalog admin' }}
        />
        <Stack.Screen
          name="AdminCatalogItem"
          component={AdminCatalogItemScreen}
          options={{ title: 'Edit catalog item' }}
        />
        <Stack.Screen
          name="AdminLandings"
          component={AdminLandingsScreen}
          options={{ title: 'Marketing landings' }}
        />
        <Stack.Screen
          name="AdminLandingEditor"
          component={AdminLandingEditorScreen}
          options={{ title: 'Edit landing' }}
        />
        {__DEV__ ? (
          <Stack.Screen
            name="GrapeWobblePreview"
            component={GrapeWobblePreviewScreen}
            options={{ title: 'Grape wobble' }}
          />
        ) : null}
      </Stack.Navigator>
    </WebDesktopFrame>
  );
}
