import React from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '../../constants/theme';
import { StorefrontPaperCardStrip } from './StorefrontPaperCardStrip';

export const PASSOVER_STRIP_HEADLINE =
  'Passover will be here before you know it';

export const PASSOVER_STRIP_BODY =
  'We’re just in the early stages of planning our Passover collection.\nPre-register now for access to discounts when the Passover boxes are released.';

export const PASSOVER_STRIP_PRIMARY_LABEL = 'Pre-register for Passover 2027';

export const PASSOVER_STRIP_SECONDARY_LABEL = 'Learn more about Passover';

type Props = {
  onPreRegister: () => void;
  onLearnMore: () => void;
  headline?: string;
  body?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryDisabled?: boolean;
};

/**
 * Paper-texture promo strip — Passover 2027 teaser.
 * Same shell as Our Story (grape mark only, cold-press paper).
 */
export function StorefrontPassoverStrip({
  onPreRegister,
  onLearnMore,
  headline = PASSOVER_STRIP_HEADLINE,
  body = PASSOVER_STRIP_BODY,
  primaryLabel = PASSOVER_STRIP_PRIMARY_LABEL,
  secondaryLabel = PASSOVER_STRIP_SECONDARY_LABEL,
  primaryDisabled = false,
}: Props) {
  return (
    <StorefrontPaperCardStrip
      headline={headline}
      body={body}
      primaryCta={{
        label: primaryLabel,
        onPress: onPreRegister,
        disabled: primaryDisabled,
      }}
      secondaryCta={{ label: secondaryLabel, onPress: onLearnMore }}
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
