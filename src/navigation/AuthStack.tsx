import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { AuthStackParamList } from './types';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignInEmailScreen } from '../screens/auth/SignInEmailScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { useAuthFlowStore } from '../stores/authFlowStore';

const Stack = createStackNavigator<AuthStackParamList>();

type Props = {
  checkoutAuth?: boolean;
};

export function AuthStack({ checkoutAuth = false }: Props) {
  const authScreen = useAuthFlowStore((s) => s.authScreen);
  const authEntry = useAuthFlowStore((s) => s.authEntry);
  const initialRoute = checkoutAuth
    ? authScreen ?? (authEntry === 'signin' ? 'SignIn' : 'SignUp')
    : 'Welcome';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignInEmail" component={SignInEmailScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}
