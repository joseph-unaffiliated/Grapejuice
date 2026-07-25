import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { spacing, typography, typeface, MOBILE_GUTTER } from '../../constants/theme';
import { BRAND_BYLINE } from '../../constants/themeMode';
import { HERO_GLAMOUR } from '../../constants/homeImages';
import { GrapejuiceBrandMark } from '../../components/brand/GrapejuiceBrandMark';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'SignIn'>;

/** Warm dark wash — keeps CTAs readable without a flat white page. */
const SCRIM_TOP =
  Platform.OS === 'web'
    ? ('linear-gradient(180deg, rgba(12, 10, 8, 0.72) 0%, rgba(12, 10, 8, 0.28) 42%, rgba(12, 10, 8, 0.55) 100%)' as const)
    : null;

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const { googleSignIn, appleSignIn, isLoading, error, clearError } = useAuthStore();

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise]);

  const topPad = Platform.OS === 'web' ? spacing.xl : Math.max(insets.top, spacing.lg);
  const bottomPad = Math.max(insets.bottom, spacing.lg) + spacing.md;

  return (
    <View style={styles.root}>
      <Image
        source={HERO_GLAMOUR}
        style={styles.bgImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          Platform.OS === 'web' && SCRIM_TOP
            ? ({ backgroundImage: SCRIM_TOP } as object)
            : { backgroundColor: 'rgba(12, 10, 8, 0.55)' },
        ]}
      />

      <Animated.View
        style={[
          styles.content,
          {
            paddingTop: topPad,
            paddingBottom: bottomPad,
            opacity: fade,
            transform: [{ translateY: rise }],
            maxWidth: isDesktop ? 440 : undefined,
          },
        ]}
      >
        <View style={styles.brandBlock}>
          <View style={styles.logoScale}>
            <GrapejuiceBrandMark color="#FFFFFF" />
          </View>
          <Text style={styles.wordmark}>Grapejuice</Text>
          <Text style={styles.byline}>{BRAND_BYLINE}</Text>
        </View>

        <View style={styles.actions}>
          <Text style={styles.headline}>Sign in</Text>
          <Text style={styles.subtitle}>Configure your Hanukkah box and pick up where you left off.</Text>

          <GrapejuiceButton
            label="Sign in with email"
            variant="pill"
            onPress={() => navigation.navigate('SignInEmail')}
            style={styles.btn}
          />

          <GrapejuiceButton
            label="Continue with Google"
            variant="pill"
            onPress={async () => {
              clearError();
              try {
                await googleSignIn();
              } catch {
                /* store */
              }
            }}
            disabled={isLoading}
            loading={isLoading}
            style={styles.btn}
          />

          {Platform.OS === 'ios' ? (
            <GrapejuiceButton
              label="Sign in with Apple"
              variant="pill"
              onPress={async () => {
                clearError();
                try {
                  await appleSignIn();
                } catch {
                  /* store */
                }
              }}
              disabled={isLoading}
              loading={isLoading}
              style={styles.btn}
            />
          ) : null}

          <GrapejuiceButton
            label="Need an account? Create one"
            variant="pillOutline"
            onPress={() => navigation.navigate('SignUp')}
            style={styles.btn}
          />

          {__DEV__ ? (
            <Text style={styles.hint}>
              In Expo Go, use email. Google works in a web browser (press w in the terminal).
            </Text>
          ) : null}

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0C0A08',
    ...(Platform.OS === 'web' ? ({ minHeight: '100%' } as object) : null),
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    justifyContent: 'space-between',
  },
  brandBlock: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  logoScale: {
    transform: [{ scale: 1.35 }],
    marginBottom: spacing.xs,
  },
  wordmark: {
    fontSize: typography.titleLg,
    ...typeface('medium'),
    color: '#FFFFFF',
    letterSpacing: -0.32,
  },
  byline: {
    fontSize: typography.sm,
    ...typeface('light'),
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: -0.22,
  },
  actions: {
    width: '100%',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  headline: {
    fontSize: typography.headerLg,
    ...typeface('medium'),
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.md,
    ...typeface('light'),
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: -0.22,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  btn: {
    alignSelf: 'stretch',
    minWidth: undefined,
  },
  hint: {
    fontSize: typography.sm,
    ...typeface('light'),
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  error: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: typography.md,
  },
});
