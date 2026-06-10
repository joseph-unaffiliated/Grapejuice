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

const HERO_INNER_GAP = 24;
const HERO_INNER_PAD = 16;
const SHADOW_BLEED = 8;
const HERO_HEIGHT = 194;
const STACK_HEIGHT = 148;
const SHADOW =
  Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.goldGlow } as object) : shadows.goldGlow;

/** Figma 370:3426 — copy then stack in column; card clips overflow. */
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
        <View style={styles.copyBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
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
  card: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
    alignItems: 'center',
    gap: HERO_INNER_GAP,
    paddingHorizontal: HERO_INNER_PAD,
    paddingVertical: HERO_INNER_GAP,
  },
  cardCompact: {
    height: undefined,
    minHeight: undefined,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'stretch',
    gap: 0,
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
