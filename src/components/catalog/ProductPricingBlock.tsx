import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  catalogPercentOff,
  formatSubscriberOfferLine,
  inferPricingTier,
  resolveCatalogDisplayPrices,
} from '../../services/box/pricing';
import { spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type Props = {
  item: CatalogItem;
  /** Household already has a Hanukkah box (draft or order) — show member price first. */
  hasBox?: boolean;
  onWhatsInTheBox?: () => void;
};

export function ProductPricingBlock({ item, hasBox, onWhatsInTheBox }: Props) {
  const { colors } = useThemeMode();
  const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
  const tier = inferPricingTier(item);
  const includedOrMemberZero =
    memberCents === 0 || tier === 'included' || tier === 'perKid';
  const off = useMemo(
    () => catalogPercentOff(nonMemberCents, memberCents),
    [nonMemberCents, memberCents]
  );

  if (hasBox) {
    const hero = includedOrMemberZero
      ? 'Included in your box'
      : formatCatalogDollars(memberCents);
    return (
      <View style={styles.root}>
        <Text style={[styles.heroPrice, { color: colors.textPrimary }]}>{hero}</Text>
        {nonMemberCents > memberCents ? (
          <Text style={[styles.retail, { color: colors.textPrimary }]}>
            {formatCatalogDollars(nonMemberCents)} retail
          </Text>
        ) : null}
      </View>
    );
  }

  const heroRetail =
    nonMemberCents > 0
      ? formatCatalogDollars(nonMemberCents)
      : includedOrMemberZero
        ? 'Included in your box'
        : formatCatalogDollars(memberCents);

  let offerLine: string | null = null;
  if (includedOrMemberZero && nonMemberCents > 0) {
    offerLine = off ? `Free (${off}% off) for subscribers` : 'Free for subscribers';
  } else if (memberCents > 0 && nonMemberCents > memberCents) {
    offerLine = formatSubscriberOfferLine(
      formatCatalogDollars(memberCents),
      nonMemberCents,
      memberCents
    );
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.heroPrice, { color: colors.textPrimary }]}>{heroRetail}</Text>
      {offerLine || onWhatsInTheBox ? (
        <View style={styles.offerRow}>
          {offerLine ? (
            <Text style={[styles.offer, { color: colors.textPrimary }]}>{offerLine}</Text>
          ) : null}
          {offerLine && onWhatsInTheBox ? (
            <Text style={[styles.offerSep, { color: colors.textSecondary }]}>·</Text>
          ) : null}
          {onWhatsInTheBox ? (
            <TouchableOpacity onPress={onWhatsInTheBox} accessibilityRole="link">
              <Text style={[styles.secondaryLink, { color: colors.textPrimary }]}>
                See what’s in the box
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 4,
    alignItems: 'flex-start',
    width: '100%',
  },
  heroPrice: {
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  retail: {
    fontSize: typography.sm,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: 0,
  },
  offerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  offer: {
    fontSize: typography.sm,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: 0,
  },
  offerSep: {
    fontSize: typography.sm,
    lineHeight: 18,
  },
  secondaryLink: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 0,
    textDecorationLine: 'underline',
  },
});
