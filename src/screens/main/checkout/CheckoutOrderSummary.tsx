import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatDollars } from '../../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../../services/box/pricing';
import type { BoxLineItem, CatalogItem } from '../../../types/pilot';
import { semanticColors, spacing, typography } from '../../../constants/theme';

export function CheckoutOrderSummary({
  lineItems,
  total,
  subtotal,
  shippingCents,
  taxCents,
  boxPriceCents,
  catalog = [],
}: {
  lineItems: BoxLineItem[];
  total: number;
  subtotal?: number;
  shippingCents?: number;
  taxCents?: number;
  boxPriceCents: number;
  catalog?: CatalogItem[];
}) {
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
          <Text style={styles.summaryName}>Shipping (US)</Text>
          <Text style={styles.summaryPrice}>{formatDollars(shippingCents)}</Text>
        </View>
      ) : null}
      {taxCents ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>Estimated tax</Text>
          <Text style={styles.summaryPrice}>{formatDollars(taxCents)}</Text>
        </View>
      ) : null}
      <Text style={styles.gapNote}>
        Pilot promo box is $50 (list $80). Shipping is free; estimated tax and add-ons are calculated at checkout.
      </Text>
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

const styles = StyleSheet.create({
  sectionTitle: { fontSize: typography.xl, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  summaryName: { flex: 1, fontSize: typography.md },
  summaryPrice: { fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semanticColors.border,
  },
  totalLabel: { fontSize: typography.xl, fontWeight: '600' },
  totalValue: { fontSize: typography.xl, fontWeight: '700', color: semanticColors.brand },
  gapNote: { fontSize: typography.sm, color: semanticColors.textSecondary, marginTop: spacing.sm, lineHeight: 18 },
});
