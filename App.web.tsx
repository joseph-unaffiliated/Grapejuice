import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { TypographyProvider } from './src/components/ui/TypographyProvider';
import { warmWebAuth } from './src/services/auth/auth';

// Start Firebase redirect completion before the font gate mounts RootNavigator.
// Late getRedirectResult is a common cause of "signed in with Google, still a guest".
warmWebAuth();

const FONT_WAIT_MS = 2500;

/**
 * Wait for DM Sans weights before first paint so text metrics don't jump
 * when Google Fonts finishes (App.web does not use expo-splash / useFonts).
 */
function useWebFontsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const finish = () => {
      if (!cancelled) setReady(true);
    };

    const load = async () => {
      try {
        const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
        if (fonts?.load) {
          await Promise.all([
            fonts.load('200 16px "DM Sans"'),
            fonts.load('400 16px "DM Sans"'),
            fonts.load('500 16px "DM Sans"'),
            fonts.load('700 16px "DM Sans"'),
          ]);
          await fonts.ready;
        }
      } catch {
        /* fall through — show UI rather than hang */
      }
      finish();
    };

    void load();
    const timeout = setTimeout(finish, FONT_WAIT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  return ready;
}

/** Web entry — no @stripe/stripe-react-native (breaks Metro web bundle). Use Stripe.js in CheckoutScreen.web.tsx. */
export default function App() {
  const fontsReady = useWebFontsReady();

  if (!fontsReady) {
    return <View style={styles.boot} />;
  }

  return (
    <SafeAreaProvider>
      <TypographyProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    ...(typeof document !== 'undefined' ? ({ minHeight: '100%' } as object) : null),
  },
});
