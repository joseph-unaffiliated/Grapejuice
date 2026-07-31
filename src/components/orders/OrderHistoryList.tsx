import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { formatDollars } from '../../services/box/buildDefaultBox';
import type { PilotOrder } from '../../types/pilot';
import { borderRadius, semanticColors, spacing, typeface, typography } from '../../constants/theme';

export function orderStatusLabel(status: PilotOrder['status']): string {
  switch (status) {
    case 'pending':
      return 'Processing payment';
    case 'committed':
      return 'Committed — charged at ship';
    case 'confirmed':
      return 'Confirmed';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    default:
      return status;
  }
}

export function isUpcomingOrder(order: PilotOrder): boolean {
  return order.status !== 'delivered';
}

export function openOrderTracking(order: PilotOrder): void {
  if (!order.trackingNumber) return;
  const carrier = (order.carrier ?? '').toLowerCase();
  let url = `https://www.google.com/search?q=${encodeURIComponent(order.trackingNumber + ' tracking')}`;
  if (carrier.includes('ups')) {
    url = `https://www.ups.com/track?tracknum=${order.trackingNumber}`;
  } else if (carrier.includes('usps')) {
    url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.trackingNumber}`;
  } else if (carrier.includes('fedex')) {
    url = `https://www.fedex.com/fedextrack/?trknbr=${order.trackingNumber}`;
  }
  void Linking.openURL(url);
}

type Props = {
  orders: PilotOrder[];
  emptyHint?: string;
  /** When set, render only matching orders under an optional heading. */
  filter?: 'upcoming' | 'past' | 'all';
  sectionTitle?: string;
};

export function OrderHistoryList({
  orders,
  emptyHint = 'No orders yet. Configure your box and check out from My Box.',
  filter = 'all',
  sectionTitle,
}: Props) {
  const filtered =
    filter === 'upcoming'
      ? orders.filter(isUpcomingOrder)
      : filter === 'past'
        ? orders.filter((o) => !isUpcomingOrder(o))
        : orders;

  if (filtered.length === 0) {
    return (
      <View style={styles.block}>
        {sectionTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
        <Text style={styles.hint}>{emptyHint}</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {sectionTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
      {filtered.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
            <Text style={styles.orderStatus}>{orderStatusLabel(order.status)}</Text>
          </View>
          <Text style={styles.orderTotal}>{formatDollars(order.totalCents)}</Text>
          {order.trackingNumber ? (
            <TouchableOpacity onPress={() => openOrderTracking(order)} accessibilityRole="link">
              <Text style={styles.trackLink}>
                Track package — {order.carrier ?? 'carrier'} {order.trackingNumber}
              </Text>
            </TouchableOpacity>
          ) : order.status === 'confirmed' || order.status === 'committed' ? (
            <Text style={styles.hint}>Tracking will appear when your box ships.</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  sectionTitle: {
    ...typeface('bold'),
    fontSize: typography.lg,
    color: semanticColors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: semanticColors.textTertiary,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: semanticColors.bgPrimary,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  orderId: { ...typeface('medium'), color: semanticColors.textPrimary },
  orderStatus: { ...typeface('medium'), color: semanticColors.brand },
  orderTotal: {
    ...typeface('regular'),
    marginTop: spacing.xs,
    fontSize: typography.lg,
    color: semanticColors.textPrimary,
  },
  trackLink: {
    ...typeface('medium'),
    marginTop: spacing.sm,
    color: semanticColors.brand,
  },
});
