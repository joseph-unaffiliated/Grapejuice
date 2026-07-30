import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Platform,
} from 'react-native';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  LIST_BOX_PRICE_CENTS,
  LIST_BOX_VALUE_CENTS,
} from '../../services/box/pricing';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

const STRIP_BG = require('../../../assets/storefront/build-box-strip-bg.jpg');

type Props = {
  onPress: () => void;
};

export function StorefrontBuildBoxStrip({ onPress }: Props) {
  const boxPrice = formatCatalogDollars(LIST_BOX_PRICE_CENTS);
  const boxValue = formatCatalogDollars(LIST_BOX_VALUE_CENTS);

  return (
    <ImageBackground
      source={STRIP_BG}
      style={styles.root}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      <View style={styles.inner}>
        <Text style={styles.headline}>Build your Hanukkah Box</Text>
        <Text style={styles.price}>
          {boxPrice}
          <Text style={styles.priceNote}> (a {boxValue} value)</Text>
        </Text>
        <Text style={styles.body}>
          8–12 pieces built around your household — menorah, candles, stories, dreidel & gelt,
          and more you can swap before lock.
        </Text>
        <Text style={styles.emphasis}>
          Plus member prices on every product in the store — often half off or more.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Build your Hanukkah Box"
        >
          <Text style={styles.ctaText}>Start your box</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const textShadow = {
  textShadowColor: 'rgba(0, 0, 0, 0.55)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 8,
};

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    minHeight: 320,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgImage: {
    width: '100%',
    height: '100%',
  },
  inner: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    ...textShadow,
  },
  price: {
    ...typeface('medium'),
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    ...textShadow,
  },
  priceNote: {
    ...typeface('regular'),
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
  },
  body: {
    ...typeface('regular'),
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    ...textShadow,
    ...(Platform.OS === 'web' ? ({ textWrap: 'balance' } as object) : null),
  },
  emphasis: {
    ...typeface('medium'),
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    ...textShadow,
  },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
  },
});
