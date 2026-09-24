import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Pressable,
} from 'react-native';
import {
  MOBILE_GUTTER,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';

const LIFESTYLE_IMG = require('../../../assets/storefront/menorahs-lifestyle-trio.jpg');
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
  // Arch: flat face of the stone (not the top curve)
  { productId: 'arch-menorah', label: '"Arch" Menorah', x: 0.31, y: 0.68 },
  // Straight beeswax candles on the Branches candle shafts
  { productId: 'beeswax-candles', label: 'Straight beeswax candles', x: 0.505, y: 0.3 },
  // Branches: metal junction below the candle cups (green annotation)
  { productId: 'branches-menorah', label: '"Branches" Menorah', x: 0.5, y: 0.48 },
  // Welcome: curved arm right of center (not the hub ring)
  { productId: 'welcome-menorah', label: '"Welcome" Menorah', x: 0.81, y: 0.63 },
];

/**
 * Positions calibrated to dreidels-lifestyle-banner.png
 * (Jelly · wrapping · wood dreidel · gelt, left→right).
 */
export const DREIDELS_LIFESTYLE_HOTSPOTS: LifestyleHotspot[] = [
  // Jelly: tan upper body, left of the face
  {
    productId: 'jelly-the-sufganiyah-stuffie',
    label: 'Jelly, the Sufganiyah Stuffie',
    x: 0.17,
    y: 0.65,
  },
  // Wrapping: menorah motif on the second gift in the stack
  { productId: 'wrapping-paper', label: 'Wrapping paper', x: 0.415, y: 0.385 },
  // Classic wood: where the stem meets the body
  {
    productId: 'classic-wooden-dreidel',
    label: 'Classic Wooden Dreidel',
    x: 0.63,
    y: 0.76,
  },
  // Gelt: coins at the mouth of the little bag
  {
    productId: 'little-bag-of-gelt-2-big-5-little',
    label: 'Little Bag of Gelt',
    x: 0.82,
    y: 0.78,
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
const DEFAULT_LABEL = 'Light the Candles';

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
  return (
    <View style={styles.outer}>
      <View style={[styles.card, { aspectRatio }]}>
        <Image
          source={image}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          pointerEvents="none"
        />
        <Pressable
          onPress={onShopAll}
          style={styles.shopLabelHit}
          accessibilityRole="link"
          accessibilityLabel={label}
        >
          <View style={styles.shopLabelScrim} pointerEvents="none" />
          <Text style={styles.shopLabel}>{label}</Text>
        </Pressable>
        {hotspots.map((h, i) => (
          <TouchableOpacity
            key={`${h.productId}-${i}`}
            style={[
              styles.hotspot,
              {
                left: `${h.x * 100}%`,
                top: `${h.y * 100}%`,
              },
            ]}
            onPress={() => onProduct(h.productId)}
            accessibilityRole="button"
            accessibilityLabel={`View ${h.label}`}
            hitSlop={10}
          >
            <View style={styles.hotspotRing}>
              <Text style={styles.hotspotPlus}>+</Text>
            </View>
          </TouchableOpacity>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  card: {
    width: '100%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: semanticColors.accentCream,
    position: 'relative',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  shopLabelHit: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'center',
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
    fontSize: 36,
    lineHeight: 42,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    zIndex: 1,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hotspot: {
    position: 'absolute',
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE,
    marginLeft: -HOTSPOT_SIZE / 2,
    marginTop: -HOTSPOT_SIZE / 2,
    zIndex: 3,
  },
  hotspotRing: {
    width: HOTSPOT_SIZE,
    height: HOTSPOT_SIZE,
    borderRadius: HOTSPOT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(4px)',
          cursor: 'pointer',
        } as object)
      : null),
  },
  hotspotPlus: {
    ...typeface('medium'),
    fontSize: 18,
    lineHeight: 20,
    color: '#FFFFFF',
    marginTop: -1,
  },
});
