import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { TypographyProvider } from './src/components/ui/TypographyProvider';
import { warmWebAuth } from './src/services/auth/auth';

// Start Firebase redirect completion before RootNavigator mounts.
// Late getRedirectResult is a common cause of "signed in with Google, still a guest".
warmWebAuth();

/**
 * Web entry — no @stripe/stripe-react-native (breaks Metro web bundle).
 * Use Stripe.js in CheckoutScreen.web.tsx.
 *
 * Do not gate first paint on document.fonts: with display=optional the old
 * 2.5s wait left a blank #root, then the whole storefront jumped in at once.
 * public/index.html paints a boot shell until React replaces #root.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <TypographyProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </TypographyProvider>
    </SafeAreaProvider>
  );
}
