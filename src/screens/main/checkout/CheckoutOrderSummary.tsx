import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatDollars } from '../../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../../services/box/pricing';
import { OrderBoxCollage, OrderProductImage, orderItemName } from '../../../components/orders/OrderPurchaseMedia';
import type { BoxLineItem, CatalogItem } from '../../../types/pilot';
import { spacing, typography, typeface, semanticColors } from '../../../constants/theme';

/** Same square as the orders collage, scaled down for the summary column. */
const SUMMARY_MEDIA = 104;

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
  compact = false,
  marketplaceOnly = false,
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
  /** When wrapped in a summary card — tighter heading spacing. */
  compact?: boolean;
  /** À la carte cart — hide Hanukkah box base line. */
  marketplaceOnly?: boolean;
}) {
  const styles = useMemo(() => createStyles(compact), [compact]);

  const chargeable = useMemo(() => {
    if (marketplaceOnly) return lineItems;
    return lineItems.filter((li) => {
      if (li.unitCents <= 0) return false;
      const item = catalog.find((c) => c.id === li.itemId);
      const tier = item ? inferPricingTier(item) : 'extra';
      return tier === 'extra' || tier === 'alaCarte';
    });
  }, [lineItems, catalog, marketplaceOnly]);

  const boxPreview = useMemo(() => {
    if (marketplaceOnly) return [];
    const priced = new Set(chargeable);
    const included = lineItems.filter((li) => !priced.has(li));
    return included.length > 0 ? included : lineItems;
  }, [lineItems, chargeable, marketplaceOnly]);

  return (
    <>
      <Text style={styles.sectionTitle}>Order summary</Text>
      {!marketplaceOnly ? (
        <View style={styles.itemRow}>
          {boxPreview.length > 0 ? (
            <OrderBoxCollage items={boxPreview} catalog={catalog} size={SUMMARY_MEDIA} linked={false} />
          ) : null}
          <Text style={styles.summaryName}>Hanukkah box</Text>
          <Text style={styles.summaryPrice}>{formatDollars(boxPriceCents)}</Text>
        </View>
      ) : null}
      {chargeable.map((li) => {
        const qty = Math.max(1, li.quantity ?? 1);
        return (
          <View key={li.slotId} style={styles.itemRow}>
            <OrderProductImage li={li} catalog={catalog} size={SUMMARY_MEDIA} linked={false} />
            <Text style={styles.summaryName}>
              {orderItemName(li, catalog)}
              {qty > 1 ? ` ×${qty}` : ''}
            </Text>
            <Text style={styles.summaryPrice}>{formatDollars(li.unitCents * li.quantity)}</Text>
          </View>
        );
      })}
      {shippingCents ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>
            Shipping (US)
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

function createStyles(compact: boolean) {
  return StyleSheet.create({
    sectionTitle: {
      ...typeface('bold'),
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
      marginTop: compact ? 0 : spacing.lg,
      marginBottom: spacing.sm,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semanticColors.border,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
      gap: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semanticColors.border,
    },
    summaryName: {
      flex: 1,
      ...typeface('regular'),
      fontSize: typography.md,
      color: semanticColors.textPrimary,
      lineHeight: 20,
    },
    summaryPrice: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.textPrimary,
      flexShrink: 0,
    },
    creditPrice: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.textSecondary,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: spacing.md,
      paddingTop: spacing.sm,
    },
    totalLabel: {
      ...typeface('medium'),
      fontSize: 18,
      color: semanticColors.textPrimary,
    },
    totalValue: {
      ...typeface('bold'),
      fontSize: 18,
      color: semanticColors.textPrimary,
    },
  });
}
