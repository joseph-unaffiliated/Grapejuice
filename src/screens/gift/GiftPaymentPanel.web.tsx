/** Gift Stripe payment step — aligned with CheckoutScreen.web visual language. */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { spacing, typography, borderRadius, typeface, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import { useWebLayout } from '../../hooks/useWebLayout';

/** Stripe Elements appearance — closer to Grapejuice checkout than default purple Stripe. */
export const GIFT_STRIPE_APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#D8C990',
    colorBackground: '#FFFFFF',
    colorText: '#110222',
    colorDanger: '#B91C1C',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    borderRadius: '8px',
    spacingUnit: '4px',
  },
};

type Props = {
  giftInviteId: string;
  recipientEmail: string;
  giverName?: string;
  amountCents?: number;
  /** True when giver curated line items (not credit-only). */
  customize?: boolean;
  onPaid: (result: { claimUrl: string }) => void;
  onCancel: () => void;
  onError: (title: string, message: string) => void;
  cancelLabel?: string;
  completePurchase: (giftInviteId: string) => Promise<{ claimUrl: string }>;
};

export function GiftPaymentPanel({
  giftInviteId,
  recipientEmail,
  giverName,
  amountCents = DEFAULT_BOX_PRICE_CENTS,
  customize = true,
  onPaid,
  onCancel,
  onError,
  cancelLabel = '← Back to box',
  completePurchase,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    if (!stripe || !elements) return;
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
      const result = await completePurchase(giftInviteId);
      onPaid(result);
    } catch (e) {
      onError('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPaying(false);
    }
  };

  const fromLabel = giverName?.trim() && !/^you$/i.test(giverName.trim()) ? giverName.trim() : 'You';

  return (
    <View style={styles.root}>
      <TouchableOpacity onPress={onCancel} style={styles.backRow} accessibilityRole="button">
        <Text style={styles.backLink}>{cancelLabel}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Payment</Text>
      <Text style={styles.lead}>
        {customize
          ? `Pay now to send the box you picked. We'll email ${recipientEmail} a link to claim it.`
          : `Pay now to send credit. We'll email ${recipientEmail} a link to claim it.`}
      </Text>

      <View
        style={[
          styles.summaryCard,
          Platform.OS === 'web' ? ({ boxShadow: shadowsWeb.sm } as object) : null,
        ]}
      >
        <Text style={styles.summaryHeading}>Order summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{customize ? 'Customized gift box' : 'Box credit'}</Text>
          <Text style={styles.summaryValue}>{formatDollars(amountCents)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>From</Text>
          <Text style={styles.summaryValue}>{fromLabel}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Send claim to</Text>
          <Text style={[styles.summaryValue, styles.summaryEmail]} numberOfLines={1}>
            {recipientEmail}
          </Text>
        </View>
        <View style={styles.summaryTotalRow}>
          <Text style={styles.totalLabel}>Total due now</Text>
          <Text style={styles.totalValue}>{formatDollars(amountCents)}</Text>
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
        accessibilityLabel={`Pay ${formatDollars(amountCents)} and send`}
      >
        {paying ? (
          <BrandLoadingMark large={false} color={colors.goldMuted} />
        ) : (
          <Text style={styles.ctaText}>Pay {formatDollars(amountCents)} & send gift</Text>
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
      backgroundColor: isDesktop ? colors.bgElevated : colors.accentCream,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    summaryHeading: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      marginBottom: spacing.md,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
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
      fontSize: typography.md,
      color: colors.textSecondary,
      flexShrink: 0,
      ...typeface('regular'),
    },
    summaryValue: {
      fontSize: typography.md,
      color: colors.textPrimary,
      textAlign: 'right',
      flex: 1,
      ...typeface('medium'),
    },
    summaryEmail: {
      ...typeface('regular'),
    },
    summaryTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    totalLabel: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('medium'),
    },
    totalValue: {
      fontSize: typography.lg,
      color: colors.logoDark,
      ...typeface('bold'),
    },
    sectionTitle: {
      fontSize: typography.titleLg,
      color: colors.textPrimary,
      letterSpacing: -0.32,
      marginBottom: spacing.sm,
      ...typeface('medium'),
    },
    paymentElementWrap: {
      minHeight: 120,
      marginBottom: spacing.md,
    },
    cta: {
      backgroundColor: colors.textPrimary,
      padding: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
      alignSelf: 'stretch',
      minHeight: 52,
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
      color: colors.goldMuted,
      fontWeight: '700',
      fontSize: typography.md,
    },
  });
}
