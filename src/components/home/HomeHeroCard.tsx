import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { HERO_STACKED_CARDS, HERO_STACKED_CARDS_SM } from '../../constants/homeImages';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography, shadows, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';

type Props = {
  title: string;
  subtitle: string;
  /** Figma 388:343 — in-progress hero: copy left, mini stack right */
  compact?: boolean;
  onPress: () => void;
};

const HERO_INNER_GAP = 24;
const HERO_INNER_PAD = 16;
const SHADOW_BLEED = 8;
const HERO_HEIGHT = 194;
const STACK_HEIGHT = 148;
/** Figma 388:343 — compact hero card shadow */
const COMPACT_HERO_SHADOW_WEB = '0px 0px 12px rgba(216, 201, 144, 0.50)';
/** Figma 388:347 — mini stack export size */
const COMPACT_STACK_WIDTH = 109;
const COMPACT_STACK_HEIGHT = 107;

/** Figma 370:3426 — copy then stack in column; compact 388:343 is row layout. */
export function HomeHeroCard({ title, subtitle, compact = false, onPress }: Props) {
  const { colors } = useThemeMode();

  if (compact) {
    const shadow =
      Platform.OS === 'web'
        ? ({ boxShadow: COMPACT_HERO_SHADOW_WEB } as object)
        : shadows.goldGlow;

    return (
      <View style={styles.shadowWrap}>
        <TouchableOpacity
          style={[styles.compactCard, { backgroundColor: colors.bgPrimary }, shadow]}
          onPress={onPress}
          activeOpacity={0.92}
        >
          <View style={styles.copyLeft}>
            <Text style={[styles.titleCompact, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.textPrimary }]}>{subtitle}</Text>
          </View>
          <Image
            source={HERO_STACKED_CARDS_SM}
            style={styles.stackSm}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </TouchableOpacity>
      </View>
    );
  }

  const shadow =
    Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlow } as object) : shadows.goldGlow;

  return (
    <View style={styles.shadowWrap}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.bgPrimary }, shadow]}
        onPress={onPress}
        activeOpacity={0.92}
      >
        <View style={styles.copyBlock}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textPrimary }]}>{subtitle}</Text>
        </View>
        <View style={styles.stackWrap}>
          <Image
            source={HERO_STACKED_CARDS}
            style={styles.stackImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    overflow: 'visible' as const,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: SHADOW_BLEED,
    marginBottom: -SHADOW_BLEED,
  },
  /** Figma 388:343 */
  compactCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  card: {
    width: '100%',
    height: HERO_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
    alignItems: 'center',
    gap: HERO_INNER_GAP,
    paddingHorizontal: HERO_INNER_PAD,
    paddingVertical: HERO_INNER_GAP,
  },
  copyBlock: {
    alignItems: 'center',
    gap: 2,
    width: '100%',
    zIndex: 2,
  },
  stackWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: STACK_HEIGHT,
    marginTop: -4,
  },
  stackImage: {
    width: '100%',
    height: STACK_HEIGHT + 12,
    maxWidth: 242,
    ...(Platform.OS === 'web'
      ? ({ objectFit: 'contain', objectPosition: 'bottom center' } as object)
      : {}),
  },
  copyLeft: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: typography.titleLg,
    fontWeight: '400',
    letterSpacing: -0.32,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: typography.lg,
    fontWeight: '400',
    letterSpacing: -0.26,
  },
  subtitle: {
    fontSize: typography.sm,
    fontWeight: '200',
    letterSpacing: -0.22,
  },
  stackSm: {
    width: COMPACT_STACK_WIDTH,
    height: COMPACT_STACK_HEIGHT,
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({ objectFit: 'contain', objectPosition: 'center' } as object)
      : {}),
  },
});
