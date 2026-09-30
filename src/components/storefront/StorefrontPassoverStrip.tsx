import React from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '../../constants/theme';
import { StorefrontPaperCardStrip } from './StorefrontPaperCardStrip';

export const PASSOVER_STRIP_HEADLINE =
  'Passover will be here before you know it';

export const PASSOVER_STRIP_BODY =
  'We’re just in the early stages of planning our Passover collection. Pre\u2011register now for access to discounts when the Passover boxes are released.';

export const PASSOVER_STRIP_PRIMARY_LABEL = 'Pre-register for Passover 2027';

type Props = {
  onPreRegister: () => void;
  headline?: string;
  body?: string;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  /** Shown under the buttons once pre-registered. */
  note?: string;
};

/**
 * Paper-texture promo strip — Passover 2027 teaser.
 * Same shell as Our Story (grape mark only, cold-press paper).
 */
export function StorefrontPassoverStrip({
  onPreRegister,
  headline = PASSOVER_STRIP_HEADLINE,
  body = PASSOVER_STRIP_BODY,
  primaryLabel = PASSOVER_STRIP_PRIMARY_LABEL,
  primaryDisabled = false,
  note,
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
      note={note}
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
