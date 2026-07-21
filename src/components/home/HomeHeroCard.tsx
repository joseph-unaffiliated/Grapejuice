import React, { useId, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { HERO_GLAMOUR } from '../../constants/homeImages';
import { colors, spacing, typography, shadows, MOBILE_GUTTER } from '../../constants/theme';

type Props = {
  title: string;
  subtitle: string;
  /** Figma 388:343 — shorter in-progress hero */
  compact?: boolean;
  onPress: () => void;
};

const SHADOW_BLEED = 8;
const HERO_HEIGHT = 194;
const COMPACT_HERO_HEIGHT = 160;
/** Brand off-black / “deep indigo” — gold-safe dark from BRAND_RULES. */
const HERO_SCRIM = colors.purple[500];
const GOLD = colors.warm[200];
/** Figma 388:343 — compact hero card shadow */
const COMPACT_HERO_SHADOW_WEB = '0px 0px 12px rgba(216, 201, 144, 0.50)';
const HERO_SHADOW_WEB = '0px 0px 16px rgba(216, 201, 144, 0.50)';

function HeroScrim({ width, height }: { width: number; height: number }) {
  const rawId = useId().replace(/:/g, '');
  const gradId = `heroScrim-${rawId}`;
  if (width <= 0 || height <= 0) return null;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={HERO_SCRIM} stopOpacity="0.92" />
          <Stop offset="0.42" stopColor={HERO_SCRIM} stopOpacity="0.55" />
          <Stop offset="0.72" stopColor={HERO_SCRIM} stopOpacity="0.18" />
          <Stop offset="1" stopColor={HERO_SCRIM} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${gradId})`} />
    </Svg>
  );
}

/** Full-bleed glamour hero — gold-washed photo + left→right dark fade for copy. */
export function HomeHeroCard({ title, subtitle, compact = false, onPress }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const height = compact ? COMPACT_HERO_HEIGHT : HERO_HEIGHT;
  const shadow =
    Platform.OS === 'web'
      ? ({ boxShadow: compact ? COMPACT_HERO_SHADOW_WEB : HERO_SHADOW_WEB } as object)
      : shadows.goldGlow;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    if (width !== size.w || h !== size.h) setSize({ w: width, h });
  };

  return (
    <View style={styles.shadowWrap}>
      <TouchableOpacity
        style={[styles.card, { height }, shadow]}
        onPress={onPress}
        onLayout={onLayout}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
      >
        <Image
          source={HERO_GLAMOUR}
          style={styles.photo}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        {/* Soft gold wash over the photo */}
        <View
          pointerEvents="none"
          style={[
            styles.goldWash,
            Platform.OS === 'web' ? ({ mixBlendMode: 'soft-light' } as object) : null,
          ]}
        />
        <HeroScrim width={size.w} height={size.h} />
        <View style={[styles.copy, compact ? styles.copyCompact : styles.copyTall]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
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
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: HERO_SCRIM,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  goldWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(216, 201, 144, 0.38)',
  },
  copy: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    justifyContent: 'center',
    maxWidth: '62%',
  },
  copyCompact: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.md,
  },
  copyTall: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  title: {
    fontSize: typography.titleLg,
    fontWeight: '500',
    letterSpacing: -0.32,
    color: GOLD,
  },
  subtitle: {
    fontSize: typography.sm,
    fontWeight: '200',
    letterSpacing: -0.22,
    color: 'rgba(244, 238, 228, 0.92)',
    marginTop: 4,
  },
});
