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
import { CheckoutScreen } from '../screens/main/CheckoutScreen';
import { OrderConfirmationScreen } from '../screens/main/OrderConfirmationScreen';
import { ReflectionFlowScreen } from '../screens/main/ReflectionFlowScreen';
import { AboutHanukkahScreen } from '../screens/main/AboutHanukkahScreen';
import { GiftGiveScreen } from '../screens/gift/GiftGiveScreen';
import { GiftGiverCustomizeScreen } from '../screens/gift/GiftGiverCustomizeScreen';
import { GiftClaimScreen } from '../screens/gift/GiftClaimScreen';
import { GiftRecipientRevealScreen } from '../screens/gift/GiftRecipientRevealScreen';
import { GuideScreen } from '../screens/main/GuideScreen';
import { KidGuideScreen } from '../screens/kids/KidGuideScreen';
import { ProfilesScreen } from '../screens/profiles/ProfilesScreen';
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
    }
  }, [isAuthenticated, pendingReturn, pendingGiftClaimToken, clearPending, navigation]);

  return null;
}

export function MainStack() {
  return (
    <WebDesktopFrame>
      <GuestBoxRevealHandler />
      <AuthReturnHandler />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          ...(Platform.OS === 'web' ? { cardStyle: { overflow: 'visible' as const } } : {}),
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="MyBox" component={MyBoxScreen} />
        {!PILOT_HIDE_IN_APP_GUIDE ? <Stack.Screen name="Guide" component={GuideScreen} /> : null}
        {!PILOT_PARENT_ONLY ? (
          <>
            <Stack.Screen name="KidGuide" component={KidGuideScreen} />
            <Stack.Screen name="Profiles" component={ProfilesScreen} />
          </>
        ) : null}
        <Stack.Screen name="AlaCarteStore" component={AlaCarteStoreScreen} />
        <Stack.Screen name="CatalogProduct" component={CatalogProductScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
        <Stack.Screen name="Reflection" component={ReflectionFlowScreen} />
        <Stack.Screen name="AboutHanukkah" component={AboutHanukkahScreen} />
        <Stack.Screen name="GiftGive" component={GiftGiveScreen} />
        <Stack.Screen name="GiftGiverCustomize" component={GiftGiverCustomizeScreen} />
        <Stack.Screen name="GiftClaim" component={GiftClaimScreen} />
        <Stack.Screen name="GiftRecipientReveal" component={GiftRecipientRevealScreen} />
      </Stack.Navigator>
    </WebDesktopFrame>
  );
}
