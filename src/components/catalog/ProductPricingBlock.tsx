import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  catalogPercentOff,
  formatSubscriberOfferLine,
  inferPricingTier,
  resolveCatalogDisplayPrices,
} from '../../services/box/pricing';
import {
  boxOnlyMemberLine,
  boxOnlyPdpHero,
  boxOnlyPdpSubcopy,
  limitedRemainingLabel,
} from '../../services/catalog/availabilityCopy';
import { spacing, typography, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

type Props = {
  item: CatalogItem;
  /** Household already has a Hanukkah box (draft or order) — show member price first. */
  hasBox?: boolean;
  onWhatsInTheBox?: () => void;
  availability?: CatalogAvailability;
  boxLocked?: boolean;
  /** Human lock date for cap-exhausted copy, e.g. "Nov 4". */
  lockLabel?: string | null;
};

export function ProductPricingBlock({
  item,
  hasBox,
  onWhatsInTheBox,
  availability,
  boxLocked,
  lockLabel,
}: Props) {
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
    const hero = formatCatalogDollars(memberCents);
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

  if (availability?.status === 'box_only') {
    const sub = boxOnlyPdpSubcopy(availability.reason, lockLabel);
    return (
      <View style={styles.root}>
        <Text style={[styles.heroPrice, { color: colors.textPrimary }]}>
          {boxOnlyPdpHero(availability.reason)}
        </Text>
        <Text style={[styles.offer, { color: colors.textPrimary }]}>
          {boxOnlyMemberLine(item)}
        </Text>
        {sub ? <Text style={[styles.retail, { color: colors.textSecondary }]}>{sub}</Text> : null}
        {onWhatsInTheBox ? (
          <TouchableOpacity onPress={onWhatsInTheBox} accessibilityRole="link">
            <Text style={[styles.secondaryLink, { color: colors.textPrimary }]}>
              See what’s in the box
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (availability?.status === 'sold_out') {
    return (
      <View style={styles.root}>
        <Text style={[styles.heroPrice, { color: colors.textSecondary }]}>Sold out</Text>
        <Text style={[styles.retail, { color: colors.textSecondary }]}>
          This item isn’t available for direct purchase right now.
        </Text>
      </View>
    );
  }

  const heroRetail =
    nonMemberCents > 0
      ? formatCatalogDollars(nonMemberCents)
      : formatCatalogDollars(memberCents);

  let offerLine: string | null = null;
  if (includedOrMemberZero && nonMemberCents > 0) {
    offerLine = off ? `Free (${off}% off) with a box` : 'Free with a box';
  } else if (memberCents > 0 && nonMemberCents > memberCents) {
    offerLine = formatSubscriberOfferLine(
      formatCatalogDollars(memberCents),
      nonMemberCents,
      memberCents
    );
  }

  const remaining =
    availability?.status === 'limited'
      ? availability.remaining
      : availability?.status === 'direct'
        ? availability.remaining
        : null;
  const showLimited =
    availability?.status === 'limited' && remaining != null && remaining > 0;

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
      {showLimited ? (
        <Text style={[styles.limited, { color: colors.textPrimary }]}>
          {limitedRemainingLabel(remaining!, Boolean(boxLocked))}
        </Text>
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
    ...typeface('medium'),
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  retail: {
    ...typeface('medium'),
    fontSize: typography.sm,
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
    ...typeface('medium'),
    fontSize: typography.sm,
    lineHeight: 18,
    letterSpacing: 0,
  },
  offerSep: {
    ...typeface('regular'),
    fontSize: typography.sm,
    lineHeight: 18,
  },
  secondaryLink: {
    ...typeface('medium'),
    fontSize: typography.sm,
    letterSpacing: 0,
    textDecorationLine: 'underline',
  },
  limited: {
    ...typeface('medium'),
    fontSize: typography.sm,
    lineHeight: 18,
    marginTop: 2,
  },
});
