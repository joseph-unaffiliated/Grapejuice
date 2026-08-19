import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { AuthStackParamList } from './types';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SignInEmailScreen } from '../screens/auth/SignInEmailScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { SignUpEmailScreen } from '../screens/auth/SignUpEmailScreen';
import { useAuthFlowStore } from '../stores/authFlowStore';
import { useDevPreviewStore } from '../stores/devPreviewStore';

const Stack = createStackNavigator<AuthStackParamList>();

type Props = {
  checkoutAuth?: boolean;
};

export function AuthStack({ checkoutAuth = false }: Props) {
  const authScreen = useAuthFlowStore((s) => s.authScreen);
  const authEntry = useAuthFlowStore((s) => s.authEntry);
  const restoreSignInEmail = useAuthFlowStore((s) => s.restoreSignInEmail);
  const previewRoute = useDevPreviewStore((s) => s.authInitialRoute);
  const initialRoute =
    previewRoute ??
    (restoreSignInEmail
      ? 'SignInEmail'
      : checkoutAuth
        ? authScreen ?? (authEntry === 'signin' ? 'SignIn' : 'SignUp')
        : 'Welcome');

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Overlay / checkout auth: let AuthHeroShell dimmed backdrop show through.
        ...(checkoutAuth
          ? { cardStyle: { backgroundColor: 'transparent' } }
          : null),
      }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ title: 'Welcome' }} />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign in' }} />
      <Stack.Screen
        name="SignInEmail"
        component={SignInEmailScreen}
        options={{ title: 'Sign in' }}
        initialParams={restoreSignInEmail ? { email: restoreSignInEmail } : undefined}
      />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Sign up' }} />
      <Stack.Screen
        name="SignUpEmail"
        component={SignUpEmailScreen}
        options={{ title: 'Sign up' }}
      />
    </Stack.Navigator>
  );
}
