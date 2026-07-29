import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  LIST_BOX_PRICE_CENTS,
  LIST_BOX_VALUE_CENTS,
  inferPricingTier,
  resolveCatalogDisplayPrices,
} from '../../services/box/pricing';
import { spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type Props = {
  item: CatalogItem;
  hasHanukkahBox?: boolean;
  onWhatsInTheBox?: () => void;
  onEligibility?: () => void;
};

function percentOff(nonMemberCents: number, memberCents: number): number | null {
  if (nonMemberCents <= 0 || memberCents >= nonMemberCents) return null;
  return Math.round(((nonMemberCents - memberCents) / nonMemberCents) * 100);
}

export function ProductPricingBlock({
  item,
  hasHanukkahBox,
  onWhatsInTheBox,
  onEligibility,
}: Props) {
  const { colors } = useThemeMode();
  const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
  const tier = inferPricingTier(item);
  const includedOrMemberZero =
    memberCents === 0 || tier === 'included' || tier === 'perKid';
  const boxPrice = formatCatalogDollars(LIST_BOX_PRICE_CENTS);
  const boxValue = formatCatalogDollars(LIST_BOX_VALUE_CENTS);
  const off = useMemo(
    () => percentOff(nonMemberCents, memberCents),
    [nonMemberCents, memberCents]
  );

  if (hasHanukkahBox) {
    const hero = includedOrMemberZero
      ? 'Included in your box'
      : formatCatalogDollars(memberCents);
    return (
      <View style={styles.root}>
        <Text style={[styles.heroPrice, { color: colors.textPrimary }]}>{hero}</Text>
        {nonMemberCents > memberCents ? (
          <Text style={[styles.compare, { color: colors.textTertiary }]}>
            <Text style={styles.strike}>{formatCatalogDollars(nonMemberCents)}</Text>
            {'  à la carte'}
          </Text>
        ) : null}
        <Text style={[styles.memberNote, { color: colors.textSecondary }]}>
          You’re getting the member price.
        </Text>
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
    offerLine = off
      ? `Free (${off}% off) for Hanukkah Box Subscribers`
      : 'Free for Hanukkah Box Subscribers';
  } else if (memberCents > 0 && nonMemberCents > memberCents) {
    offerLine = off
      ? `Only ${formatCatalogDollars(memberCents)} (${off}% off) for Hanukkah Box Subscribers`
      : `Only ${formatCatalogDollars(memberCents)} for Hanukkah Box Subscribers`;
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.heroPrice, { color: colors.textPrimary }]}>{heroRetail}</Text>
      {offerLine ? (
        <Text style={[styles.offer, { color: colors.textPrimary }]}>{offerLine}</Text>
      ) : null}

      {onWhatsInTheBox ? (
        <TouchableOpacity onPress={onWhatsInTheBox} accessibilityRole="link" style={styles.linkRow}>
          <Text style={[styles.secondaryLink, { color: colors.textPrimary }]}>
            See what’s in the box
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={onEligibility}
        disabled={!onEligibility}
        accessibilityRole="link"
        style={styles.linkRow}
      >
        <Text style={[styles.valueLine, { color: colors.textSecondary }]}>
          {boxPrice} ({boxValue} value)
          {onEligibility ? (
            <Text style={{ color: colors.textPrimary }}>
              {' — see if I’m eligible for additional discounts'}
            </Text>
          ) : null}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    alignItems: 'flex-start',
    width: '100%',
  },
  heroPrice: {
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  compare: {
    fontSize: typography.md,
    letterSpacing: 0,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  offer: {
    fontSize: typography.md + 1,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
  memberNote: {
    fontSize: typography.sm,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
  linkRow: {
    marginTop: spacing.xs,
    paddingVertical: 2,
  },
  secondaryLink: {
    fontSize: typography.sm,
    fontWeight: '500',
    letterSpacing: 0,
    textDecorationLine: 'underline',
  },
  valueLine: {
    fontSize: typography.sm,
    lineHeight: 20,
    letterSpacing: 0,
  },
});
