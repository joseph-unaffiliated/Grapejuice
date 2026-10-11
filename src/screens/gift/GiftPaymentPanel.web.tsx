/** Gift Stripe payment step — same Account-style chrome as the Payment page. */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { formatDollars } from '../../services/box/buildDefaultBox';
import {
  CURATED_GIFT_BOX_LABEL,
  giftCreditProductLabel,
} from '../../constants/giftCopy';
import { DEFAULT_BOX_PRICE_CENTS } from '../../services/box/pricing';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { checkoutUi } from '../main/checkout/checkoutUi';
import { PAYMENT_ELEMENT_OPTIONS } from '../main/checkout/stripeAppearance';
import { metaEventIds, trackMeta, trackMetaCustom } from '../../services/analytics/metaPixel';
import { revealField } from '../../utils/revealField';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { OrderSummary, type OrderLine } from '../../components/mobile/OrderSummary';
import type { BoxThumb } from '../../components/mobile/BoxSummary';
import { StickyBar } from '../../components/mobile/StickyBar';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { m, mFont, mType } from '../../components/mobile/mobileTheme';

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
  /** Discount code / influencer offer the server applied; the recipient still gets amountCents. */
  discountCents?: number;
  discountLabel?: string;
  /** What the PaymentIntent charges. Defaults to amountCents. */
  amountDueCents?: number;
  /** True when giver curated line items (not credit-only). */
  customize?: boolean;
  onPaid: (result: { claimUrl: string }) => void;
  /** ← Back link; omit when the page already has one. */
  onCancel?: () => void;
  onError: (title: string, message: string) => void;
  /** Small "Cancel gift" link under Pay — wipes the incomplete gift. */
  onCancelGift?: () => void;
  completePurchase: (giftInviteId: string) => Promise<{ claimUrl: string }>;
  /** Phone summary: box thumbnails, the base box price and how many kids it's for. */
  thumbs?: BoxThumb[];
  boxCents?: number;
  kidCount?: number;
  hasNote?: boolean;
};

const money = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : formatDollars(cents));

export function GiftPaymentPanel({
  giftInviteId,
  recipientEmail,
  giverName,
  amountCents = DEFAULT_BOX_PRICE_CENTS,
  discountCents = 0,
  discountLabel = 'Discount',
  amountDueCents,
  customize = true,
  onPaid,
  onCancel,
  onError,
  onCancelGift,
  completePurchase,
  thumbs = [],
  boxCents,
  kidCount = 1,
  hasNote,
}: Props) {
  const mobileLayout = useMobileLayout();
  const dueCents = amountDueCents ?? amountCents;
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [elementState, setElementState] = useState<'loading' | 'slow' | 'ready' | 'error'>(
    'loading'
  );
  const [elementError, setElementError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const paymentWrapRef = useRef<View>(null);

  useEffect(() => {
    if (elementState !== 'loading') return;
    const t = setTimeout(() => setElementState((s) => (s === 'loading' ? 'slow' : s)), 12000);
    return () => clearTimeout(t);
  }, [elementState]);

  const pay = async () => {
    if (!stripe || !elements) return;
    if (!cardComplete) {
      // Inline field errors instead of an alert, and bring the card form into view.
      const { error } = await elements.submit();
      if (error) {
        revealField(paymentWrapRef.current, { focus: false });
        elements.getElement('payment')?.focus();
        return;
      }
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
      const giftParams = {
        value: dueCents / 100,
        currency: 'USD',
        order_id: giftInviteId,
        content_name: customize ? 'Gift box' : 'Gift credit',
        content_type: 'product' as const,
      };
      trackMeta('Purchase', giftParams, metaEventIds.giftPurchase(giftInviteId));
      trackMetaCustom('GiftSent', giftParams, metaEventIds.giftSent(giftInviteId));
      const result = await completePurchase(giftInviteId);
      onPaid(result);
    } catch (e) {
      onError('Could not send gift', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPaying(false);
    }
  };

  const fromLabel = giverName?.trim() && !/^you$/i.test(giverName.trim()) ? giverName.trim() : 'You';

  const paymentElement = (
    <View ref={paymentWrapRef} style={styles.paymentElementWrap}>
      <PaymentElement
        options={PAYMENT_ELEMENT_OPTIONS}
        onReady={() => setElementState('ready')}
        onChange={(event) => setCardComplete(event.complete)}
        onLoadError={(event) => {
          console.warn('[gift] PaymentElement failed to load', event.error);
          setElementError(event.error?.message ?? null);
          setElementState('error');
        }}
      />
      {elementState === 'loading' ? (
        <Text style={[checkoutUi.hint, styles.elementNote]}>Loading secure payment form…</Text>
      ) : null}
      {elementState === 'error' || elementState === 'slow' ? (
        <Text style={[checkoutUi.fieldError, styles.elementNote]}>
          {elementState === 'error'
            ? `The payment form couldn't load${elementError ? ` (${elementError})` : ''}. Refresh the page or try another browser.`
            : 'The payment form is taking a while. If it doesn’t appear, refresh the page or turn off content blockers for this site.'}
        </Text>
      ) : null}
    </View>
  );

  if (mobileLayout) {
    const kids = `${kidCount} ${kidCount === 1 ? 'kid' : 'kids'}`;
    const base = customize ? Math.min(boxCents ?? amountCents, amountCents) : amountCents;
    const lines: OrderLine[] = customize
      ? [
          { label: `Box for ${kids}`, value: money(base) },
          ...(amountCents > base ? [{ label: 'Extras', value: money(amountCents - base) }] : []),
          ...(discountCents > 0 ? [{ label: discountLabel, value: `−${money(discountCents)}` }] : []),
          { label: 'Shipping', value: 'Free' },
        ]
      : [
          { label: 'Hanukkah credit', value: money(amountCents) },
          ...(discountCents > 0 ? [{ label: discountLabel, value: `−${money(discountCents)}` }] : []),
        ];
    const sub = [customize ? kids : null, `To ${recipientEmail}`, hasNote ? 'note added' : null].filter(Boolean).join(' · ');
    return (
      <View style={mStyles.wrap}>
        <Text style={[mType.h1, mStyles.h1]}>Pay for the gift</Text>
        <OrderSummary
          title={customize ? 'Hanukkah box for their family' : giftCreditProductLabel(amountCents)}
          sub={sub}
          items={customize ? thumbs : []}
          lines={lines}
          totalLabel="Paid today"
          total={money(dueCents)}
        />
        <View style={mStyles.note}>
          <Icon icon={icons.card} size={14} color={m.gold} />
          <Text style={mStyles.noteText}>
            You're charged once, today. We'll email them a link to {customize ? 'their box' : 'the credit'}.
          </Text>
        </View>
        <Text style={mStyles.h2}>Payment</Text>
        {paymentElement}
        <StickyBar
          label="Paid today"
          total={money(dueCents)}
          layout="stack"
          cta={{ label: 'Pay and send gift', onPress: () => void pay(), busy: paying, disabled: paying || elementState !== 'ready' }}
        />
      </View>
    );
  }

  return (
    <View>
      {onCancel ? (
        <TouchableOpacity
          onPress={onCancel}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={checkoutUi.title}>Payment</Text>
      <Text style={checkoutUi.lead}>
        {customize
          ? `Pay now to send the box you picked. We'll email ${recipientEmail} a link to claim it.`
          : `Pay now to send credit. We'll email ${recipientEmail} a link to claim it.`}
      </Text>

      <View style={checkoutUi.divider} />

      <Text style={styles.summaryHeading}>Order Summary</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryName}>
          {customize ? CURATED_GIFT_BOX_LABEL : giftCreditProductLabel(amountCents)}
        </Text>
        <Text style={styles.summaryValue}>{formatDollars(amountCents)}</Text>
      </View>
      {discountCents > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryName}>{discountLabel}</Text>
          <Text style={styles.summaryValue}>-{formatDollars(discountCents)}</Text>
        </View>
      ) : null}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryName}>From</Text>
        <Text style={styles.summaryValue}>{fromLabel}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryName}>Send claim to</Text>
        <Text style={[styles.summaryValue, styles.summaryEmail]} numberOfLines={1}>
          {recipientEmail}
        </Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalText}>Total due now</Text>
        <Text style={styles.totalText}>{formatDollars(dueCents)}</Text>
      </View>

      <View style={checkoutUi.divider} />

      <Text style={checkoutUi.sectionHeading}>Payment Method</Text>
      {paymentElement}

      <GrapejuiceButton
        label={cardComplete ? 'Send your gift' : 'Continue'}
        variant="filled"
        onPress={() => void pay()}
        loading={paying}
        disabled={elementState !== 'ready'}
        accessibilityLabel={
          cardComplete ? `Pay ${formatDollars(dueCents)} and send your gift` : 'Continue'
        }
        style={[checkoutUi.button, styles.ctaSpacing]}
        textStyle={checkoutUi.buttonText}
      />
      {onCancelGift ? (
        <TouchableOpacity
          onPress={onCancelGift}
          disabled={paying}
          style={styles.cancelGift}
          accessibilityRole="button"
          accessibilityLabel="Cancel gift"
          hitSlop={8}
        >
          <Text style={styles.cancelGiftText}>Cancel gift</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: spacing.lg, alignSelf: 'flex-start' },
  backText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.goldMuted,
  },
  summaryHeading: { ...checkoutUi.sectionHeading, marginBottom: spacing.xs },
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
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 20,
    color: semanticColors.textPrimary,
    flexShrink: 0,
  },
  summaryValue: {
    ...typeface('medium'),
    fontSize: typography.md,
    lineHeight: 20,
    color: semanticColors.textPrimary,
    textAlign: 'right',
    flex: 1,
  },
  summaryEmail: { ...typeface('regular') },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  totalText: {
    ...typeface('medium'),
    fontSize: 18,
    letterSpacing: -0.3,
    color: semanticColors.logoDark,
  },
  paymentElementWrap: { minHeight: 120, marginTop: spacing.xs },
  elementNote: { marginTop: spacing.sm },
  ctaSpacing: { marginTop: spacing.xl },
  cancelGift: { alignSelf: 'center', marginTop: spacing.md },
  cancelGiftText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textTertiary,
    textDecorationLine: 'underline',
  },
});

const mStyles = StyleSheet.create({
  wrap: { paddingTop: 20 },
  h1: { fontSize: 27, marginBottom: 14 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 16 },
  noteText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: m.body, ...mFont(400) },
  h2: { fontSize: 22, color: m.ink, marginTop: 26, marginBottom: 12, ...mFont(400) },
});
