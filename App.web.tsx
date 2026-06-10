import 'react-native-gesture-handler';
import React from 'react';
import { Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { TypographyProvider } from './src/components/ui/TypographyProvider';

/** On web, zero safe-area insets — avoids extra bottom margin below the tab bar. */
const { width = 0, height = 0 } = Dimensions.get('window');
const webInitialMetrics = {
  frame: { x: 0, y: 0, width, height },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Web entry — no @stripe/stripe-react-native (breaks Metro web bundle). Use Stripe.js in CheckoutScreen.web.tsx. */
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={webInitialMetrics}>
      <TypographyProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </TypographyProvider>
    </SafeAreaProvider>
  );
}
