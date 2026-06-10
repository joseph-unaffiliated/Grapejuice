import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { StripeProvider } from '@stripe/stripe-react-native';
import {
  useFonts,
  DMSans_200ExtraLight,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { TypographyProvider } from './src/components/ui/TypographyProvider';

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
const stripePublishableKey = extra?.stripePublishableKey ?? '';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_200ExtraLight,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  React.useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Avoid permanent blank screen if fonts fail (especially on web when App.web is not picked up).
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={stripePublishableKey || 'pk_test_placeholder'}>
          <TypographyProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </TypographyProvider>
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
