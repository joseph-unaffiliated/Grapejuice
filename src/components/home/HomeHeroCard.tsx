import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { HERO_STACKED_CARDS, HERO_STACKED_CARDS_SM } from '../../constants/homeImages';
import { semanticColors, spacing, typography, shadows, shadowsWeb, MOBILE_GUTTER } from '../../constants/theme';

type Props = {
  title: string;
  subtitle: string;
  /** June 9 PDF — in-progress hero: copy left, small stack right (388:347) */
  compact?: boolean;
  onPress: () => void;
};

const SHADOW_BLEED = 8;
const HERO_HEIGHT = 194;
const STACK_HEIGHT = 148;
/** Pull stack up so cards sit behind headline copy (Figma 370:3426). */
const STACK_OVERLAP = 28;
const SHADOW =
  Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlowSm } as object) : shadows.goldGlow;

/** Figma 370:3426 — copy at top; stack anchored bottom-center, clipped by card. */
export function HomeHeroCard({ title, subtitle, compact = false, onPress }: Props) {
  if (compact) {
    return (
      <View style={styles.shadowWrap}>
        <TouchableOpacity style={[styles.card, styles.cardCompact, SHADOW]} onPress={onPress} activeOpacity={0.92}>
          <View style={styles.row}>
            <View style={styles.copyLeft}>
              <Text style={styles.titleCompact}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Image
              source={HERO_STACKED_CARDS_SM}
              style={styles.stackSm}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.shadowWrap}>
      <TouchableOpacity style={[styles.card, SHADOW]} onPress={onPress} activeOpacity={0.92}>
        <View style={styles.copyOverlay}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.imageWrap}>
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

const stackImageBase = {
  width: '100%' as const,
  height: STACK_HEIGHT,
  maxWidth: 242,
};

const styles = StyleSheet.create({
  shadowWrap: {
    overflow: 'visible' as const,
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: SHADOW_BLEED,
    marginBottom: -SHADOW_BLEED,
  },
  card: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  cardCompact: {
    height: undefined,
    minHeight: undefined,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'stretch',
  },
  copyOverlay: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    zIndex: 2,
    alignItems: 'center',
    gap: 2,
  },
  imageWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: STACK_HEIGHT + STACK_OVERLAP,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  stackImage: {
    ...stackImageBase,
    height: STACK_HEIGHT + STACK_OVERLAP,
    ...(Platform.OS === 'web'
      ? ({ objectFit: 'contain', objectPosition: 'bottom center' } as object)
      : {}),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    width: '100%',
  },
  copyLeft: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: typography.titleLg,
    fontWeight: '400',
    color: semanticColors.textPrimary,
    letterSpacing: -0.32,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: semanticColors.textPrimary,
    letterSpacing: -0.26,
  },
  subtitle: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textPrimary,
    letterSpacing: -0.22,
  },
  stackSm: { width: 72, height: 71 },
});
