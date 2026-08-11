import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
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
import { GuideScreen } from '../screens/main/GuideScreen';
import { KidGuideScreen } from '../screens/kids/KidGuideScreen';
import { ProfilesScreen } from '../screens/profiles/ProfilesScreen';
import { GrapeWobblePreviewScreen } from '../screens/dev/GrapeWobblePreviewScreen';
import { AdminCatalogScreen } from '../screens/admin/AdminCatalogScreen';
import { AdminCatalogItemScreen } from '../screens/admin/AdminCatalogItemScreen';
import { PILOT_PARENT_ONLY, PILOT_HIDE_IN_APP_GUIDE } from '../constants/pilotFeatures';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { useGuestSessionStore } from '../stores/guestSessionStore';

const Stack = createStackNavigator<MainStackParamList>();

function GuestBoxRevealHandler() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const openMyBoxAfterReveal = useGuestSessionStore((s) => s.openMyBoxAfterReveal);
  const consumeOpenMyBoxAfterReveal = useGuestSessionStore((s) => s.consumeOpenMyBoxAfterReveal);

  useEffect(() => {
    if (!openMyBoxAfterReveal) return;
    consumeOpenMyBoxAfterReveal();
    navigation.navigate('MyBox');
  }, [openMyBoxAfterReveal, consumeOpenMyBoxAfterReveal, navigation]);

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
  const initialRouteName = (() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return 'MainTabs' as const;
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/' || path === '/store' || path.startsWith('/store/')) {
      return 'StorefrontHome' as const;
    }
    return 'MainTabs' as const;
  })();

  return (
    <WebDesktopFrame>
      <GuestBoxRevealHandler />
      <AuthReturnHandler />
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          ...(Platform.OS === 'web' ? { cardStyle: { overflow: 'visible' as const } } : {}),
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ title: 'Home' }} />
        <Stack.Screen name="MyBox" component={MyBoxScreen} options={{ title: 'My Box' }} />
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
