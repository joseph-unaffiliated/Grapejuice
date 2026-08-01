import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatDollars } from '../../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../../services/box/pricing';
import type { BoxLineItem, CatalogItem } from '../../../types/pilot';
import { spacing, typography, typeface } from '../../../constants/theme';
import { useThemeMode } from '../../../context/ThemeContext';
import type { SemanticColors } from '../../../constants/themeMode';

export function CheckoutOrderSummary({
  lineItems,
  total,
  subtotal,
  shippingCents,
  taxCents,
  boxPriceCents,
  catalog = [],
  giftCreditApplied = 0,
  platformCreditApplied = 0,
  expeditedShipping = false,
  compact = false,
}: {
  lineItems: BoxLineItem[];
  total: number;
  subtotal?: number;
  shippingCents?: number;
  taxCents?: number;
  boxPriceCents: number;
  catalog?: CatalogItem[];
  giftCreditApplied?: number;
  platformCreditApplied?: number;
  expeditedShipping?: boolean;
  /** When wrapped in a summary card — tighter heading spacing. */
  compact?: boolean;
}) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);

  const chargeable = useMemo(() => {
    return lineItems.filter((li) => {
      const item = catalog.find((c) => c.id === li.itemId);
      const tier = item ? inferPricingTier(item) : li.unitCents > 0 ? 'extra' : 'included';
      return tier === 'extra' || tier === 'alaCarte';
    });
  }, [lineItems, catalog]);

  return (
    <>
      <Text style={styles.sectionTitle}>Order summary</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryName}>Hanukkah box</Text>
        <Text style={styles.summaryPrice}>{formatDollars(boxPriceCents)}</Text>
      </View>
      {chargeable.map((li) => (
        <View key={li.slotId} style={styles.summaryRow}>
          <Text style={styles.summaryName}>{li.label ?? li.itemId}</Text>
          <Text style={styles.summaryPrice}>{formatDollars(li.unitCents * li.quantity)}</Text>
        </View>
      ))}
      {shippingCents ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>
            {expeditedShipping ? 'Expedited shipping (US)' : 'Shipping (US)'}
          </Text>
          <Text style={styles.summaryPrice}>{formatDollars(shippingCents)}</Text>
        </View>
      ) : null}
      {giftCreditApplied ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>Gift credit</Text>
          <Text style={styles.creditPrice}>-{formatDollars(giftCreditApplied)}</Text>
        </View>
      ) : null}
      {platformCreditApplied ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>Platform credit</Text>
          <Text style={styles.creditPrice}>-{formatDollars(platformCreditApplied)}</Text>
        </View>
      ) : null}
      {taxCents ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>Estimated tax</Text>
          <Text style={styles.summaryPrice}>{formatDollars(taxCents)}</Text>
        </View>
      ) : null}
      {subtotal != null && subtotal !== total ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>Subtotal</Text>
          <Text style={styles.summaryPrice}>{formatDollars(subtotal + (shippingCents ?? 0))}</Text>
        </View>
      ) : null}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatDollars(total)}</Text>
      </View>
    </>
  );
}

function createStyles(colors: SemanticColors, compact: boolean) {
  return StyleSheet.create({
    sectionTitle: {
      fontSize: typography.xl,
      color: colors.textPrimary,
      marginTop: compact ? 0 : spacing.lg,
      marginBottom: spacing.md,
      fontWeight: '700',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      gap: spacing.md,
    },
    summaryName: {
      flex: 1,
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('regular'),
    },
    summaryPrice: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    creditPrice: {
      fontSize: typography.md,
      color: colors.brand,
      ...typeface('medium'),
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.goldMuted,
    },
    totalLabel: {
      fontSize: typography.xl,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    totalValue: {
      fontSize: typography.xl,
      color: colors.brand,
      ...typeface('medium'),
    },
  });
}
