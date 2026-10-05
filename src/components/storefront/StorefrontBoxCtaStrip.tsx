import React from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '../../constants/theme';
import { StorefrontPaperCardStrip } from './StorefrontPaperCardStrip';

export type StorefrontBoxCtaVariant = 'build' | 'confirm';

const COPY: Record<StorefrontBoxCtaVariant, { headline: string; body: string; label: string }> = {
  build: {
    headline: 'Hanukkah will be here\nbefore you know it',
    body: 'Let us build a box tailored for your family and get everything you need (candles, gelt, dreidels, Hanukkah activities, wrapping paper...) delivered to your door in time for the holiday.',
    label: 'Build my Hanukkah Box',
  },
  confirm: {
    headline: 'Confirm your box or your items might sell out!',
    body: 'Once you tell us where to ship your box and add your payment information we will hold all the items in your box so you won’t need to worry about items selling out.',
    label: 'Add Shipping and Payment Info Now',
  },
};

type Props = {
  /** `build` before a box exists; `confirm` once a box is started but has no payment. */
  variant: StorefrontBoxCtaVariant;
  onPress: () => void;
};

/** Paper-texture box CTA near the bottom of store home (same shell as Our Story). */
export function StorefrontBoxCtaStrip({ variant, onPress }: Props) {
  const copy = COPY[variant];
  return (
    <StorefrontPaperCardStrip
      headline={copy.headline}
      body={copy.body}
      primaryCta={{ label: copy.label, onPress }}
      style={styles.outer}
    />
  );
}

const styles = StyleSheet.create({
  /** Extra breathe before footer — Our Story keeps default marginVertical.md. */
  outer: {
    marginBottom: spacing.xxl,
  },
});
