import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const LIFESTYLE_IMG = require('../../../assets/storefront/menorahs-lifestyle-trio.webp');
/** Native aspect of the lifestyle plate. */
const ASPECT = 2048 / 1142;

export type LifestyleHotspot = {
  /** Catalog product slug / id for PDP. */
  productId: string;
  /** Accessibility / tooltip label. */
  label: string;
  /** Center of the hotspot as 0–1 fractions of the image. */
  x: number;
  y: number;
};

/**
 * Positions calibrated to product bodies on menorahs-lifestyle-trio.jpg
 * (Arch · beeswax candles · Branches · Welcome, left→right).
 */
export const MENORAHS_LIFESTYLE_HOTSPOTS: LifestyleHotspot[] = [
  // Arch: left of stone face
  { productId: 'arch-menorah', label: '"Arch" Menorah', x: 0.112, y: 0.633 },
  // Straight beeswax candles on the Branches candle shafts
  { productId: 'beeswax-candles', label: 'Straight beeswax candles', x: 0.424, y: 0.269 },
  // Branches: lower on the base / right of center
  { productId: 'branches-menorah', label: '"Branches" Menorah', x: 0.56, y: 0.78 },
  // Welcome: curved arm
  { productId: 'welcome-menorah', label: '"Welcome" Menorah', x: 0.782, y: 0.697 },
];

/**
 * Positions calibrated to dreidels-lifestyle-banner (webp)
 * (Jelly · wrapping · wood dreidel · gelt, left→right).
 */
export const DREIDELS_LIFESTYLE_HOTSPOTS: LifestyleHotspot[] = [
  // Jelly: tan upper body, left of the face
  {
    productId: 'jelly-the-sufganiyah-stuffie',
    label: 'Jelly, the Sufganiyah Stuffie',
    x: 0.193,
    y: 0.608,
  },
  // Wrapping: menorah-pattern gift
  { productId: 'wrapping-paper', label: 'Wrapping paper', x: 0.272, y: 0.376 },
  // Classic wood: body of the dreidel
  {
    productId: 'classic-wooden-dreidel',
    label: 'Classic Wooden Dreidel',
    x: 0.605,
    y: 0.808,
  },
  // Gelt: coins at the mouth of the little bag
  {
    productId: 'little-bag-of-gelt-2-big-5-little',
    label: 'Little Bag of Gelt',
    x: 0.805,
    y: 0.854,
  },
];

type Props = {
  onShopAll: () => void;
  onProduct: (productId: string) => void;
  /** Defaults to menorahs lifestyle plate. */
  image?: number;
  /** Shop-all overlay label. Defaults to "Light the Candles". */
  label?: string;
  hotspots?: LifestyleHotspot[];
  /** Override when `image` has a different native aspect than the menorahs plate. */
  aspectRatio?: number;
};

const HOTSPOT_SIZE = 28;
const DEFAULT_LABEL = 'Light the\nCandles';

function LifestyleHotspotMarker({
  hotspot,
  onPress,
}: {
  hotspot: LifestyleHotspot;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const nearTop = hotspot.y < 0.22;

  return (
    <Pressable
      style={[
        styles.hotspot,
        {
          left: `${hotspot.x * 100}%`,
          top: `${hotspot.y * 100}%`,
        },
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={`View ${hotspot.label}`}
      hitSlop={10}
    >
      {hovered ? (
        <View
          style={[
            styles.hotspotTooltip,
            nearTop ? styles.hotspotTooltipBelow : styles.hotspotTooltipAbove,
          ]}
          pointerEvents="none"
        >
          <Text style={styles.hotspotTooltipText}>{hotspot.label}</Text>
        </View>
      ) : null}
      <View style={styles.hotspotRing}>
        <Text style={styles.hotspotPlus}>+</Text>
      </View>
    </Pressable>
  );
}

/**
 * Full-width (content column) lifestyle plate with product hotspots.
 * Replaces the Menorahs (and Dreidels) section header on the store home.
 */
export function StorefrontMenorahsLifestyleCard({
  onShopAll,
  onProduct,
  image = LIFESTYLE_IMG,
  label = DEFAULT_LABEL,
  hotspots = MENORAHS_LIFESTYLE_HOTSPOTS,
  aspectRatio = ASPECT,
}: Props) {
  const { isCompact: compact } = useLayoutBreakpoint();
  /**
   * Taller than the native plate — cover crops left/right so height grows
   * without widening the card (desktop + mobile).
   */
  const displayAspect = aspectRatio * 0.82;
  /** Soft line breaks are desktop-only; mobile title sits above the plate on one line. */
  const displayLabel = compact ? label.replace(/\n+/g, ' ') : label;

  return (
    <View style={[styles.outer, compact && styles.outerCompact]}>
      {compact ? (
        <Pressable
          onPress={onShopAll}
          style={styles.titleAbove}
          accessibilityRole="link"
          accessibilityLabel={displayLabel}
        >
          <Text style={styles.shopLabelMobile}>{displayLabel}</Text>
        </Pressable>
      ) : null}
      <View
        style={[
          styles.card,
          compact && styles.cardCompact,
          { aspectRatio: displayAspect },
        ]}
      >
        <View
          style={[styles.cardClip, compact && styles.cardClipCompact]}
          pointerEvents="none"
        >
          <Image
            source={image}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
        {!compact ? (
          <View style={styles.shopLabelCenter} pointerEvents="box-none">
            <Pressable
              onPress={onShopAll}
              style={styles.shopLabelHit}
              accessibilityRole="link"
              accessibilityLabel={displayLabel}
            >
              <View style={styles.shopLabelScrim} pointerEvents="none" />
              <Text style={styles.shopLabel}>{displayLabel}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onShopAll}
            style={StyleSheet.absoluteFillObject}
            accessibilityRole="link"
            accessibilityLabel={displayLabel}
          />
        )}
        {hotspots.map((h, i) => (
          <LifestyleHotspotMarker
            key={`${h.productId}-${i}`}
            hotspot={h}
            onPress={() => onProduct(h.productId)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    paddingBottom: spacing.md,
  },
  outerCompact: {
    maxWidth: '100%',
    paddingHorizontal: 0,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  titleAbove: {
    alignSelf: 'stretch',
    marginBottom: spacing.md,
    paddingHorizontal: MOBILE_GUTTER,
  },
  shopLabelMobile: {
    ...typeface('medium'),
    // Match Build Box strip headline (“Secure your Hanukkah Box”).
    fontSize: 40,
    lineHeight: 38,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.accentCream,
    position: 'relative',
    // Allow hotspot tooltips to escape the plate; image is clipped separately.
    overflow: 'visible',
  },
  cardCompact: {
    borderRadius: 0,
  },
  cardClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  cardClipCompact: {
    borderRadius: 0,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  shopLabelCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  shopLabelHit: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Light scrim so white type stays readable on bright photo areas. */
  shopLabelScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    ...(Platform.OS === 'web'
      ? ({
          filter: 'blur(10px)',
          transform: [{ scale: 1.2 }],
        } as object)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
        }),
  },
  shopLabel: {
    ...typeface('medium'),
    fontSize: 64,
    lineHeight: 60,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
    zIndex: 1,
  },
  hotspot: {
    position: 'absolute',
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE,
    marginLeft: -HOTSPOT_SIZE / 2,
    marginTop: -HOTSPOT_SIZE / 2,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  hotspotRing: {
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE,
    borderRadius: HOTSPOT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotspotPlus: {
    ...typeface('medium'),
    fontSize: 18,
    lineHeight: 20,
    color: '#FFFFFF',
    marginTop: -1,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  hotspotTooltip: {
    position: 'absolute',
    left: '50%',
    maxWidth: 280,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(20, 20, 20, 0.92)',
    zIndex: 4,
    ...(Platform.OS === 'web'
      ? ({
          width: 'max-content',
          transform: [{ translateX: '-50%' }],
        } as object)
      : { marginLeft: -140 }),
  },
  hotspotTooltipAbove: {
    bottom: HOTSPOT_SIZE + 6,
  },
  hotspotTooltipBelow: {
    top: HOTSPOT_SIZE + 6,
  },
  hotspotTooltipText: {
    ...typeface('medium'),
    fontSize: typography.xs,
    lineHeight: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
});
