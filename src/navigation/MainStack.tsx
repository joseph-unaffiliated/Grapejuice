import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from './types';
import { WebDesktopFrame } from '../components/layout/WebDesktopFrame';
import { MainTabs } from './MainTabs';
import { MyBoxScreen } from '../screens/main/MyBoxScreen';
import { GuideScreen } from '../screens/main/GuideScreen';
import { AlaCarteStoreScreen } from '../screens/main/AlaCarteStoreScreen';
import { CheckoutScreen } from '../screens/main/CheckoutScreen';
import { OrderConfirmationScreen } from '../screens/main/OrderConfirmationScreen';
import { KidsVoteScreen } from '../screens/main/KidsVoteScreen';
import { ReflectionFlowScreen } from '../screens/main/ReflectionFlowScreen';
import { useAuthStore } from '../stores/authStore';
import { useAuthFlowStore } from '../stores/authFlowStore';

const Stack = createStackNavigator<MainStackParamList>();

function AuthReturnHandler() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
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
    }
  }, [isAuthenticated, pendingReturn, clearPending, navigation]);

  return null;
}

export function MainStack() {
  return (
    <WebDesktopFrame>
      <AuthReturnHandler />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="MyBox" component={MyBoxScreen} />
        <Stack.Screen name="Guide" component={GuideScreen} />
        <Stack.Screen name="AlaCarteStore" component={AlaCarteStoreScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
        <Stack.Screen name="KidsVote" component={KidsVoteScreen} />
        <Stack.Screen name="Reflection" component={ReflectionFlowScreen} />
      </Stack.Navigator>
    </WebDesktopFrame>
  );
}
