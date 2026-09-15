import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  freeShippingPromoLine,
} from '../../constants/hanukkahBoxLock';
import { getHanukkahConfig } from '../../services/firestore/config';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

/** Centered promo line; wraps as one unit if the viewport is too narrow. */
export function StorefrontPromoStrip() {
  const insets = useSafeAreaInsets();
  const [promo, setPromo] = useState(() => freeShippingPromoLine(null));
  const paddingTop =
    Platform.OS === 'web'
      ? // Prefer CSS env so iPhone Safari notch clearance works even if RN insets lag.
        (`max(${spacing.sm}px, env(safe-area-inset-top, 0px))` as unknown as number)
      : spacing.sm + insets.top;

  useEffect(() => {
    let cancelled = false;
    getHanukkahConfig().then((config) => {
      if (cancelled) return;
      setPromo(freeShippingPromoLine(config.estimatedDeliveryBy));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.root, { paddingTop }]}>
      <Text style={styles.line}>{promo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.accentCream,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
  },
  line: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
});
