import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { StorefrontMediaPlaceholder } from './StorefrontMediaPlaceholder';
import type { StorefrontMediaSlot } from '../../constants/storefrontMedia';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

type Props = {
  slot: StorefrontMediaSlot;
  reverse?: boolean;
  onCta: () => void;
};

export function StorefrontEditorialBand({ slot, reverse, onCta }: Props) {
  const { width } = useWindowDimensions();
  const stacked = width < 768;

  return (
    <View style={[styles.root, reverse && !stacked && styles.rootReverse]}>
      <View style={[styles.mediaCol, stacked && styles.mediaColStacked]}>
        <StorefrontMediaPlaceholder
          slot={slot}
          style={[
            styles.media,
            slot.aspect === '4/5'
              ? styles.mediaPortrait
              : slot.aspect === '3/2'
                ? styles.mediaLandscape
                : styles.mediaWide,
          ]}
        />
      </View>
      <View style={[styles.copyCol, stacked && styles.copyColStacked]}>
        {slot.headline ? <Text style={styles.headline}>{slot.headline}</Text> : null}
        {slot.body ? <Text style={styles.body}>{slot.body}</Text> : null}
        {slot.ctaLabel ? (
          <TouchableOpacity
            style={styles.cta}
            onPress={onCta}
            accessibilityRole="button"
            accessibilityLabel={slot.ctaLabel}
          >
            <Text style={styles.ctaText}>{slot.ctaLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
  },
  rootReverse: {
    flexDirection: 'row-reverse',
  },
  mediaCol: {
    flex: 1,
    minWidth: 260,
  },
  mediaColStacked: {
    width: '100%',
    flex: undefined,
  },
  media: {
    width: '100%',
  },
  mediaWide: {
    aspectRatio: 16 / 9,
  },
  mediaLandscape: {
    aspectRatio: 3 / 2,
    maxHeight: 520,
  },
  mediaPortrait: {
    aspectRatio: 4 / 5,
    maxHeight: 520,
  },
  copyCol: {
    flex: 1,
    minWidth: 220,
    gap: spacing.sm,
  },
  copyColStacked: {
    width: '100%',
    flex: undefined,
  },
  headline: {
    ...typeface('medium'),
    fontSize: 28,
    color: semanticColors.logoDark,
  },
  body: {
    ...typeface('regular'),
    fontSize: 16,
    color: semanticColors.textSecondary,
    lineHeight: 24,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: semanticColors.logoDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textInverse,
  },
});
