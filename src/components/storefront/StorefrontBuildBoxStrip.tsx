import React, { useId, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const STRIP_BG = require('../../../assets/storefront/boxrevealv2.webp');

/** Hard offset shadow — darker gold than goldMuted (#B8AC7F), plate behind the button. */
const CTA_SHADOW = '#7A6E42';
const CTA_PRESS_OFFSET_Y = 4;

/**
 * Reverse vignette — circle sized to strip width (diameter = width, top/bottom may clip).
 * Warm dark + soft-light deepens without black-multiply gray-out; light warm multiply adds punch.
 */
const VIGNETTE_SOFT_LIGHT_WEB =
  'radial-gradient(circle farthest-side at 50% 50%, rgba(36, 24, 14, 0.95) 0%, rgba(48, 32, 20, 0.78) 36%, rgba(58, 40, 26, 0.42) 64%, transparent 100%)';
const VIGNETTE_MULTIPLY_WEB =
  'radial-gradient(circle farthest-side at 50% 50%, rgba(52, 34, 20, 0.58) 0%, rgba(58, 40, 26, 0.34) 40%, transparent 72%)';

/** Warm wood-tone dark for native overlay (no mix-blend); circle radius = half strip width. */
const NATIVE_VIGNETTE_STOPS = [
  { offset: '0', color: '#24180e', opacity: '0.85' },
  { offset: '0.36', color: '#322214', opacity: '0.55' },
  { offset: '0.64', color: '#3a281a', opacity: '0.28' },
  { offset: '1', color: '#3a281a', opacity: '0' },
] as const;

type Props = {
  onPress: () => void;
};

function NativeReverseVignette({ width, height }: { width: number; height: number }) {
  const rawId = useId().replace(/:/g, '');
  const gradId = `buildBoxReverseVignette-${rawId}`;
  if (width <= 0 || height <= 0) return null;

  const cx = width / 2;
  const cy = height / 2;
  const r = width / 2;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={gradId} cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
          {NATIVE_VIGNETTE_STOPS.map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${gradId})`} />
    </Svg>
  );
}

export function StorefrontBuildBoxStrip({ onPress }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const isWeb = Platform.OS === 'web';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  return (
    <ImageBackground
      source={STRIP_BG}
      style={styles.root}
      imageStyle={styles.bgImage}
      resizeMode="cover"
      onLayout={onLayout}
    >
      {/* Reverse vignette: warm soft-light + light multiply; circle = strip width */}
      {isWeb ? (
        <>
          <View style={styles.vignetteSoftLight} pointerEvents="none" />
          <View style={styles.vignetteMultiply} pointerEvents="none" />
        </>
      ) : (
        <NativeReverseVignette width={size.w} height={size.h} />
      )}
      <View style={styles.inner}>
        <Text style={styles.headline}>Reveal your Personalized Hanukkah Box</Text>
        <Text style={styles.body}>
          Each box is tailored just for your family based on how many people live with you, their
          ages, and your familiarity with the holiday, and includes all the essentials you'll need
          for Hanukkah: Candles, latkes, a dreidel and gelt, wrapping paper, books, and more.
          Arrives a week or two before the first night.
        </Text>
        <View style={styles.ctaWrap}>
          {/* Static hard shadow plate — button slides onto it when pressed */}
          <View style={styles.ctaShadow} pointerEvents="none" />
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Reveal now"
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaPressed,
              Platform.OS === 'web'
                ? ({
                    transitionProperty: 'transform',
                    transitionDuration: '100ms',
                    transitionTimingFunction: 'ease-out',
                  } as object)
                : null,
            ]}
          >
            <Text style={styles.ctaText}>Reveal now</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xxl + spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    minHeight: 340,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgImage: {
    width: '100%',
    height: '100%',
  },
  vignetteSoftLight: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: VIGNETTE_SOFT_LIGHT_WEB,
          mixBlendMode: 'soft-light',
        } as object)
      : null),
  },
  vignetteMultiply: {
    ...StyleSheet.absoluteFillObject,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: VIGNETTE_MULTIPLY_WEB,
          mixBlendMode: 'multiply',
        } as object)
      : null),
  },
  inner: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 1,
  },
  headline: {
    ...typeface('light'),
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: 0.6,
    color: semanticColors.textInverse,
    textAlign: 'center',
  },
  body: {
    ...typeface('regular'),
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 380,
    marginTop: spacing.xs, // +6px beyond column gap; tighter title→body like hero
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  ctaWrap: {
    marginTop: spacing.sm,
    position: 'relative',
    alignSelf: 'center',
  },
  ctaShadow: {
    ...StyleSheet.absoluteFillObject,
    top: CTA_PRESS_OFFSET_Y,
    left: 0,
    right: 0,
    bottom: -CTA_PRESS_OFFSET_Y,
    backgroundColor: CTA_SHADOW,
    borderRadius: borderRadius.md,
  },
  cta: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaPressed: {
    transform: [{ translateY: CTA_PRESS_OFFSET_Y }],
  },
  ctaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
