import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  LIST_BOX_PRICE_CENTS,
  inferPricingTier,
  resolveCatalogDisplayPrices,
} from '../../services/box/pricing';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type Props = {
  item: CatalogItem;
  /** Household already on a paid / card-on-file box path. */
  onBoxPath?: boolean;
  onWhatsInTheBox?: () => void;
};

export function ProductPricingBlock({ item, onBoxPath, onWhatsInTheBox }: Props) {
  const { colors } = useThemeMode();
  const { memberCents, nonMemberCents, savingsCents } = resolveCatalogDisplayPrices(item);
  const tier = inferPricingTier(item);
  const includedOrMemberZero =
    memberCents === 0 || tier === 'included' || tier === 'perKid';
  const showCompare = nonMemberCents > memberCents;
  const boxPrice = formatCatalogDollars(LIST_BOX_PRICE_CENTS);

  const heroLabel = includedOrMemberZero
    ? 'Included in your box'
    : formatCatalogDollars(memberCents);

  return (
    <View style={styles.root}>
      <Text style={[styles.heroPrice, { color: colors.textPrimary }]}>{heroLabel}</Text>

      {showCompare ? (
        <Text style={[styles.compare, { color: colors.textSecondary }]}>
          {includedOrMemberZero ? (
            <Text>
              <Text style={styles.strike}>{formatCatalogDollars(nonMemberCents)}</Text>
              <Text>{' à la carte'}</Text>
            </Text>
          ) : (
            <Text>
              <Text>À la carte </Text>
              <Text style={styles.strike}>{formatCatalogDollars(nonMemberCents)}</Text>
            </Text>
          )}
        </Text>
      ) : null}

      {savingsCents > 0 && !includedOrMemberZero ? (
        <View style={[styles.chip, { backgroundColor: colors.brandLight, borderColor: colors.brand }]}>
          <Text style={[styles.chipText, { color: colors.textPrimary }]}>
            Save {formatCatalogDollars(savingsCents)} with a box
          </Text>
        </View>
      ) : null}

      {onBoxPath ? (
        <Text style={[styles.memberNote, { color: colors.textSecondary }]}>
          You’re getting the member price.
        </Text>
      ) : (
        <View style={[styles.callout, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
          <Text style={[styles.calloutTitle, { color: colors.textPrimary }]}>
            Hanukkah box — {boxPrice}
          </Text>
          <Text style={[styles.calloutBody, { color: colors.textSecondary }]}>
            Unlock member pricing on pieces like this, plus the curated box — candles, story, food,
            gifts, and more. The box is the product; the savings across the catalog make {boxPrice}{' '}
            an obvious unlock.
          </Text>
          {onWhatsInTheBox ? (
            <TouchableOpacity onPress={onWhatsInTheBox} accessibilityRole="link">
              <Text style={[styles.secondaryLink, { color: colors.brand }]}>What’s in the box?</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  heroPrice: {
    fontSize: typography.titleLg + 8,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  compare: {
    fontSize: typography.md,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  chip: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  chipText: {
    fontSize: typography.sm,
    fontWeight: '600',
  },
  memberNote: {
    fontSize: typography.sm,
    marginTop: spacing.xs,
  },
  callout: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    width: '100%',
  },
  calloutTitle: {
    fontSize: typography.md,
    fontWeight: '700',
  },
  calloutBody: {
    fontSize: typography.sm,
    lineHeight: 20,
  },
  secondaryLink: {
    fontSize: typography.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
});
