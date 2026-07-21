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
const COMPACT_HERO_SHADOW_WEB = '0px 0px 12px rgba(216, 201, 144, 0.50)';
const HERO_SHADOW_WEB = '0px 0px 16px rgba(216, 201, 144, 0.50)';
const HOVER_MS = 400;
const HOVER_ZOOM = 1.04;
const FADE_SIZE_REST = '68% 100%';
const FADE_SIZE_HOVER = '92% 100%';

const FADE_CSS =
  `linear-gradient(to right, ${HERO_SCRIM}eb 0%, ${HERO_SCRIM}8c 42%, ${HERO_SCRIM}2e 72%, ${HERO_SCRIM}00 100%)`;

/** Native fallback — fixed SVG scrim. */
function HeroScrimSvg({ width, height }: { width: number; height: number }) {
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
  const [hovered, setHovered] = useState(false);
  const height = compact ? COMPACT_HERO_HEIGHT : HERO_HEIGHT;
  const isWeb = Platform.OS === 'web';
  const shadow = isWeb
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
        activeOpacity={0.95}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
        {...(isWeb
          ? ({
              onMouseEnter: () => setHovered(true),
              onMouseLeave: () => setHovered(false),
            } as object)
          : {})}
      >
        <View style={styles.photoClip} pointerEvents="none">
          {/*
            Bottom-anchored crop: pin the img to the bottom of an oversized box so
            cover crops from the top (bottom of the photo stays in view).
          */}
          <View
            style={[
              styles.photoStage,
              isWeb
                ? ({
                    transform: [{ scale: hovered ? HOVER_ZOOM : 1 }],
                    transitionProperty: 'transform',
                    transitionDuration: `${HOVER_MS}ms`,
                    transitionTimingFunction: 'ease',
                    transformOrigin: 'center bottom',
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                  } as object)
                : null,
            ]}
          >
            <Image
              source={HERO_GLAMOUR}
              style={[
                styles.photo,
                isWeb
                  ? ({
                      objectFit: 'cover',
                      objectPosition: 'center bottom',
                    } as object)
                  : null,
              ]}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.goldWash,
            isWeb ? ({ mixBlendMode: 'soft-light' } as object) : null,
          ]}
        />
        {isWeb ? (
          <View
            pointerEvents="none"
            style={[
              styles.fadeBand,
              {
                backgroundImage: FADE_CSS,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'left center',
                backgroundSize: hovered ? FADE_SIZE_HOVER : FADE_SIZE_REST,
                transitionProperty: 'background-size',
                transitionDuration: `${HOVER_MS}ms`,
                transitionTimingFunction: 'ease',
              } as object,
            ]}
          />
        ) : (
          <HeroScrimSvg width={size.w} height={size.h} />
        )}
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
  photoClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  /** Taller than the card; pinned to bottom so cover keeps the photo's bottom in frame. */
  photoStage: {
    position: 'absolute',
    left: -8,
    right: -8,
    bottom: -8,
    height: '135%',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  goldWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(216, 201, 144, 0.38)',
  },
  fadeBand: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    zIndex: 1,
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
