import React, { type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { HOME_HOLIDAY_THUMBS } from '../../constants/homeImages';
import { BRAND_BYLINE } from '../../constants/themeMode';
import {
  spacing,
  typography,
  typeface,
  shadows,
  shadowsWeb,
} from '../../constants/theme';

const FULL_LOCKUP = require('../../../assets/brand/grapejuice-full-lockup.png');
const FULL_LOCKUP_ASPECT = 1024 / 230;

const IMAGE_SHADOW =
  Platform.OS === 'web'
    ? ('linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.58) 45%, rgba(0, 0, 0, 0.75) 100%)' as const)
    : null;

type Props = {
  children: ReactNode;
  /** Hide byline under the lockup (rare). */
  showByline?: boolean;
};

/** Shared Welcome / Sign-in / Sign-up chrome: photo backdrop + floating white card + full lockup. */
export function AuthHeroShell({ children, showByline = true }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();

  const topPad = Platform.OS === 'web' ? spacing.xxl : Math.max(insets.top, spacing.xl);
  const bottomPad = Math.max(insets.bottom, spacing.xl) + spacing.lg;
  const logoWidth = isDesktop ? 280 : 232;

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
              style={{ width: logoWidth, height: logoWidth / FULL_LOCKUP_ASPECT }}
              resizeMode="contain"
              accessibilityLabel="Grapejuice"
            />
            {showByline ? (
              <Text style={[styles.byline, { color: colors.textTertiary }]}>{BRAND_BYLINE}</Text>
            ) : null}
          </View>
          {children}
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
});
