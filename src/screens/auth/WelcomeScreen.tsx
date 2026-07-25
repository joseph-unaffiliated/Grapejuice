import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useThemeMode } from '../../context/ThemeContext';
import { useFirebaseReady } from '../../hooks/useFirebaseReady';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { useWebLayout } from '../../hooks/useWebLayout';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { HOME_HOLIDAY_THUMBS } from '../../constants/homeImages';
import { BRAND_BYLINE } from '../../constants/themeMode';
import {
  spacing,
  typography,
  typeface,
  shadows,
  shadowsWeb,
} from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'Welcome'>;

/** Welcome-only full lockup (wordmark + grapes). */
const FULL_LOCKUP = require('../../../assets/brand/grapejuice-full-lockup.png');
const FULL_LOCKUP_ASPECT = 1024 / 230;

/** Darker wash so the white card pops over the lifestyle photo. */
const IMAGE_SHADOW =
  Platform.OS === 'web'
    ? ('linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.58) 45%, rgba(0, 0, 0, 0.75) 100%)' as const)
    : null;

export function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const { ready, error, projectId } = useFirebaseReady();
  const startExplore = useGuestSessionStore((s) => s.startExplore);
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);
  const { appleSignIn, isLoading, clearError } = useAuthStore();

  const topPad = Platform.OS === 'web' ? spacing.xxl : Math.max(insets.top, spacing.xl);
  const bottomPad = Math.max(insets.bottom, spacing.xl) + spacing.lg;

  return (
    <View style={styles.root}>
      <Image
        source={HOME_HOLIDAY_THUMBS.highHolidays}
        style={styles.bgImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          Platform.OS === 'web' && IMAGE_SHADOW
            ? ({ backgroundImage: IMAGE_SHADOW } as object)
            : { backgroundColor: 'rgba(0, 0, 0, 0.65)' },
        ]}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPad, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlow } as object) : shadows.goldGlow,
            {
              maxWidth: isDesktop ? 480 : undefined,
              backgroundColor: colors.bgPrimary,
            },
          ]}
        >
          <View style={styles.brandBlock}>
            <Image
              source={FULL_LOCKUP}
              style={{
                width: isDesktop ? 280 : 232,
                height: (isDesktop ? 280 : 232) / FULL_LOCKUP_ASPECT,
              }}
              resizeMode="contain"
              accessibilityLabel="Grapejuice"
            />
            <Text style={[styles.byline, { color: colors.textTertiary }]}>{BRAND_BYLINE}</Text>
          </View>

          <Text style={[styles.headline, { color: colors.textSecondary }]}>
            A Hanukkah box for families who want to celebrate — and need help knowing how.
          </Text>

          {__DEV__ ? (
            <Text style={[styles.firebase, { color: ready ? colors.success : colors.warning }]}>
              Firebase {projectId ? `(${projectId})` : ''}:{' '}
              {ready ? 'connected' : error ? 'setup needed' : 'checking…'}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <GrapejuiceButton
              label="Explore Grapejuice"
              variant="filled"
              onPress={() => startExplore()}
              style={styles.btn}
            />
            <GrapejuiceButton
              label="Build your Hanukkah box"
              variant="pillOutline"
              onPress={() => startBuildBox()}
              style={styles.btn}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate('SignIn')}
              style={styles.loginBtn}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              <Text style={[styles.loginText, { color: colors.brand }]}>Log in</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' ? (
              <GrapejuiceButton
                label="Sign in with Apple"
                variant="pillOutline"
                onPress={async () => {
                  clearError();
                  try {
                    await appleSignIn();
                  } catch {
                    /* store */
                  }
                }}
                disabled={isLoading}
                style={styles.btn}
              />
            ) : null}

            {__DEV__ ? (
              <TouchableOpacity onPress={() => startExplore()} style={styles.devBtn}>
                <Text style={[styles.devText, { color: colors.textTertiary }]}>Dev: enter app</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Explore holidays and talk to Rav without an account. Build a box when you are ready — sign
            up at checkout.
          </Text>
        </View>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  card: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 16,
    // Breathing room from card edges — keep content gaps tighter separately.
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  byline: {
    fontSize: typography.sm,
    ...typeface('light'),
    letterSpacing: -0.22,
  },
  headline: {
    fontSize: typography.md,
    ...typeface('light'),
    letterSpacing: -0.22,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  firebase: {
    fontSize: typography.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  btn: {
    alignSelf: 'stretch',
    minWidth: undefined,
  },
  loginBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  loginText: {
    fontSize: typography.lg,
    ...typeface('medium'),
    letterSpacing: -0.26,
  },
  devBtn: { marginTop: spacing.xs, alignItems: 'center' },
  devText: {
    fontSize: typography.sm,
    ...typeface('light'),
  },
  hint: {
    fontSize: typography.sm,
    ...typeface('light'),
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
