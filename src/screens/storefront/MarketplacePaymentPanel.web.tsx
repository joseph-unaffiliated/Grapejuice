/** Marketplace Stripe payment step — aligned with GiftPaymentPanel.web. */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { spacing, typography, borderRadius, typeface, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useWebLayout } from '../../hooks/useWebLayout';
import type { BoxLineItem } from '../../types/pilot';

type Props = {
  lineItems: BoxLineItem[];
  totalCents: number;
  onPaid: () => void;
  onCancel: () => void;
  onError: (title: string, message: string) => void;
};

export function MarketplacePaymentPanel({
  lineItems,
  totalCents,
  onPaid,
  onCancel,
  onError,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    if (!stripe || !elements) {
      onError('Payment not ready', 'Stripe is still loading. Wait a moment and try again.');
      return;
    }
    setPaying(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
        redirect: 'if_required',
      });
      if (error) {
        onError('Payment failed', error.message ?? 'Please try again.');
        return;
      }
      onPaid();
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={onCancel} style={styles.backRow} accessibilityRole="button">
        <Text style={styles.backLink}>← Back to shipping</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Payment</Text>
      <Text style={styles.lead}>Pay now to place your order. We&apos;ll ship to the address you entered.</Text>

      <View
        style={[
          styles.summaryCard,
          Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : null,
        ]}
      >
        <Text style={styles.summaryHeading}>Order summary</Text>
        {lineItems.map((li) => (
          <View key={`${li.slotId}-${li.itemId}`} style={styles.summaryRow}>
            <Text style={styles.summaryLabel} numberOfLines={2}>
              {li.label ?? li.itemId}
              {(li.quantity ?? 1) > 1 ? ` × ${li.quantity}` : ''}
            </Text>
            <Text style={styles.summaryValue}>
              {formatDollars(li.unitCents * Math.max(1, li.quantity ?? 1))}
            </Text>
          </View>
        ))}
        <View style={styles.summaryTotalRow}>
          <Text style={styles.totalLabel}>Total due now</Text>
          <Text style={styles.totalValue}>{formatDollars(totalCents)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Payment method</Text>
      <View style={styles.paymentElementWrap}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </View>

      <TouchableOpacity
        style={[styles.cta, paying && styles.ctaDisabled]}
        onPress={() => void pay()}
        disabled={paying}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Pay ${formatDollars(totalCents)} and place order`}
      >
        {paying ? (
          <BrandLoadingMark large={false} color={colors.goldMuted} />
        ) : (
          <Text style={styles.ctaText}>Pay {formatDollars(totalCents)} & place order</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    root: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      paddingTop: isDesktop ? spacing.sm : 0,
    },
    backRow: { marginBottom: spacing.md, alignSelf: 'flex-start' },
    backLink: {
      color: colors.brand,
      fontSize: typography.md,
      ...typeface('medium'),
    },
    title: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginBottom: spacing.sm,
      ...typeface('regular'),
    },
    lead: {
      fontSize: typography.md,
      lineHeight: typography.md * 1.45,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      ...typeface('regular'),
    },
    summaryCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    summaryHeading: {
      fontSize: typography.xl,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      ...typeface('medium'),
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    summaryLabel: {
      flex: 1,
      fontSize: typography.md,
      color: colors.textSecondary,
      ...typeface('regular'),
    },
    summaryValue: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    summaryTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    totalLabel: {
      fontSize: typography.lg,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    totalValue: {
      fontSize: typography.lg,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    sectionTitle: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    paymentElementWrap: { minHeight: 120, marginBottom: spacing.md },
    cta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
      color: colors.goldMuted,
      fontWeight: '700',
    },
  });
}
