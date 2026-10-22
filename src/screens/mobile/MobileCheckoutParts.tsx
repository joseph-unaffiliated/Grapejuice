import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../../navigation/types';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { useBoxGlance, NOT_HELD_COPY } from '../../hooks/useBoxGlance';
import { trackMeta, metaEventIds } from '../../services/analytics/metaPixel';
import { PAYMENT_ELEMENT_OPTIONS } from '../main/checkout/stripeAppearance';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { BoxSummary } from '../../components/mobile/BoxSummary';
import { OrderSummary, type OrderLine } from '../../components/mobile/OrderSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { MobileFooterBleed, MobileFooterSpacer, MOBILE_FOOTER_TOP_GAP, mobileFooterScrollStyle } from '../../components/mobile/MobileFooter';
import { m, mFont, mGutter, mRadius, mType, balanceProps } from '../../components/mobile/mobileTheme';
import { checkoutChargeLine, isImmediateChargeWindow } from '../../constants/hanukkahBoxLock';
import { usePreviewNow } from '../../hooks/useUserStatePreview';
import { MobileCodeSignIn, CodeEntry } from '../../components/mobile/MobileCodeSignIn';
export { CodeEntry };

/* ------------------------------------------------------------------ sign-in by code */

export function MobileCheckoutGate({ onBack }: { onBack: () => void }) {
  const glance = useBoxGlance();
  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader back={{ label: 'Box', onPress: onBack }} title="Checkout" right={<Secure />} />
      <ScrollView keyboardShouldPersistTaps="handled">
        <MobileCodeSignIn
          title="Pick up where you left off"
          lead="Your box is saved to your email. We'll send a 6-digit code to sign you in. No password needed."
          createIfMissing
        >
          <View style={{ marginVertical: 20 }}>
            <BoxSummary size="sm" total={glance.totalLabel} items={glance.thumbs} />
          </View>
        </MobileCodeSignIn>
      </ScrollView>
    </View>
  );
}

function Secure() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon icon={icons.fingerprint} size={11} color={m.muted} />
      <Text style={{ fontSize: 12, color: m.muted }}>Secure</Text>
    </View>
  );
}

/** The card already on file, named, with a clear way to use another. */
export function MobileSavedCard({ label, onChange, disabled }: { label: string; onChange: () => void; disabled?: boolean }) {
  return (
    <View style={styles.savedCard}>
      <View style={styles.savedCardIcon}>
        <Icon icon={icons.card} size={16} color={m.goldDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.savedCardTitle} numberOfLines={1}>{label}</Text>
        <Text style={styles.savedCardSub}>Saved card · used for this box</Text>
      </View>
      <Pressable onPress={onChange} disabled={disabled} accessibilityRole="button" accessibilityLabel="Use a different card" hitSlop={8}>
        <Text style={styles.link}>Use a different card</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ one-page checkout */

/** Room above the white bar for the cookie button, so the terms can scroll clear of it. */
const COOKIE_BUTTON_CLEARANCE = 110;

type LayoutProps = {
  onBack: () => void;
  lockShort: string;
  cardOnFile: boolean;
  thumbs: React.ComponentProps<typeof BoxSummary>['items'];
  lines: OrderLine[];
  total: string;
  receipt?: React.ReactNode;
  discount?: React.ReactNode;
  address: React.ReactNode;
  sms?: React.ReactNode;
  payment: React.ReactNode;
  bar: React.ReactNode;
  lockedNote?: string | null;
};

/** Task header, one reassurance line, the order summary, shipping, payment, and the bar passed in. */
export function MobileCheckoutLayout(p: LayoutProps) {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const now = usePreviewNow();
  const chargeLine = checkoutChargeLine(p.lockShort, now);
  const immediate = isImmediateChargeWindow(now);
  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader back={{ label: 'Box', onPress: p.onBack }} title="Checkout" right={<Secure />} />
      <ScrollView contentContainerStyle={{ paddingBottom: STICKY_BAR_CLEARANCE + COOKIE_BUTTON_CLEARANCE }} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          <View style={styles.assure}>
            <Icon icon={icons.calendar} size={14} color={m.goldDark} />
            <Text style={styles.assureText}>{chargeLine}</Text>
          </View>
          <Text style={styles.held}>{NOT_HELD_COPY}</Text>
          {p.lockedNote ? <Text style={styles.error}>{p.lockedNote}</Text> : null}
          <View style={{ marginTop: 14 }}>
            <OrderSummary
              sub={
                p.receipt ? (
                  <Text style={styles.link} onPress={() => setOpen((v) => !v)}>
                    {open ? 'Hide' : 'Show'} what's inside
                  </Text>
                ) : undefined
              }
              items={p.thumbs}
              lines={p.lines}
              totalLabel={immediate ? 'Charged today' : `Charged after ${p.lockShort}`}
              total={p.total}
            >
              {open ? p.receipt : null}
            </OrderSummary>
          </View>
        </View>
        <View style={[styles.pad, { paddingTop: 26 }]}>
          <View style={styles.sectionHead}>
            <Text style={mType.h2}>Shipping</Text>
            <Text style={mType.small}>Free · U.S. only</Text>
          </View>
          {p.address}
          {p.sms}
        </View>
        <View style={[styles.pad, { paddingTop: 26 }]}>
          <View style={styles.sectionHead}>
            <Text style={mType.h2}>Payment</Text>
            <Text style={mType.small}>{chargeLine}</Text>
          </View>
          {p.payment}
          {p.discount ? <View style={{ marginTop: 12 }}>{p.discount}</View> : null}
          <Text style={styles.terms} {...balanceProps}>
            By placing your order you agree to Grapejuice's{' '}
            <Text
              style={styles.termsLink}
              accessibilityRole="link"
              accessibilityLabel="Terms"
              onPress={() => navigation.navigate('StorefrontTerms')}
            >
              Terms
            </Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
              onPress={() => navigation.navigate('StorefrontPrivacy')}
            >
              Privacy Policy
            </Text>
            . {chargeLine}
          </Text>
        </View>
      </ScrollView>
      {p.bar}
    </View>
  );
}

/**
 * Inside <Elements>: the Stripe card form and the Done! bar, disabled until the card is
 * complete and the caller's required fields are filled. Done! checks
 * the address first (passed in), then confirms the SetupIntent, then hands off to the
 * existing card-saved flow that waits for the webhook and commits the box.
 */
export function MobileCardAndPlaceOrder({
  total,
  chargeLabel,
  beforeConfirm,
  onSaved,
  returnUrl,
  disabled,
  notify,
}: {
  total: string;
  chargeLabel: string;
  beforeConfirm: () => Promise<boolean>;
  onSaved: () => void;
  returnUrl?: string;
  disabled?: boolean;
  notify: (title: string, body: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const place = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      if (!(await beforeConfirm())) return;
      const { error, setupIntent } = await stripe.confirmSetup({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' });
      if (error) {
        notify('Could not save card', error.message ?? 'Please try again.');
        return;
      }
      if (setupIntent?.id) trackMeta('AddPaymentInfo', undefined, metaEventIds.addPaymentInfo(setupIntent.id));
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <View style={styles.cardWrap}>
        <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} onChange={(ev) => setCardComplete(ev.complete)} />
      </View>
      <StickyBar label={chargeLabel} total={total} layout="stack" cookieGap cta={{ label: 'Done!', onPress: () => void place(), busy: saving, disabled: disabled || saving || !cardComplete || !stripe || !elements }} testID="mobile-checkout-bar" />
    </>
  );
}

/* ------------------------------------------------------------------ confirmation */

export function MobileCheckoutDone({ lockShort, startsLabel, onViewBox, onShop }: { lockShort: string; startsLabel: string | null; onViewBox: () => void; onShop: () => void }) {
  const now = usePreviewNow();
  const immediate = isImmediateChargeWindow(now);
  const steps: [string, string][] = immediate
    ? [
        ['Today', 'Your card is charged and this box locks.'],
        ['Next', 'We start packing. The box can no longer be changed.'],
        [startsLabel ? `Before ${startsLabel}` : 'Before the first night', 'It arrives in time for the first candle.'],
      ]
    : [
        ['Today', 'Order placed. Card saved, not charged.'],
        [`Until ${lockShort}`, 'Swap, add or remove anything in My Box.'],
        [`End of ${lockShort}`, 'Your box locks and we start packing.'],
        [`After ${lockShort}`, 'Your card is charged. We email you again when it ships.'],
        [startsLabel ? `Before ${startsLabel}` : 'Before the first night', 'It arrives in time for the first candle.'],
      ];
  const ics = () => {
    if (Platform.OS !== 'web') return;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:Last day to change your Grapejuice Hanukkah box`, `DESCRIPTION:Open grapejuice.co/box to make any last changes.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    void Linking.openURL(`data:text/calendar;charset=utf8,${encodeURIComponent(body)}`);
  };
  return (
    <MobileDoneLayout title="Your box is set" lede={immediate ? 'Your card was charged and this box is locked.' : `You can change anything until ${lockShort}. $0 today. Cancel free before then.`} steps={steps}>
      <MobileButton label="View my box" onPress={onViewBox} />
      <MobileButton label="Shop extras" variant="secondary" onPress={onShop} style={{ marginTop: 10 }} />
      {!immediate ? (
        <Pressable onPress={ics} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 16 }}>
          <Text style={styles.link}>Add {lockShort} to my calendar</Text>
        </Pressable>
      ) : null}
    </MobileDoneLayout>
  );
}

/** Confirmation page: check badge, title, a dated timeline, then the actions. */
export function MobileDoneLayout({ title, lede, steps, children }: { title: string; lede: string; steps: [string, string][]; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.pad, mobileFooterScrollStyle, { paddingTop: 28, paddingBottom: 0 }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓</Text>
        </View>
        <Text style={mType.h1} {...balanceProps}>{title}</Text>
        <Text style={[mType.body, { marginTop: 8 }]} {...balanceProps}>{lede}</Text>
        <View style={styles.timeline}>
          {steps.map(([t, d], i) => (
            <View key={t} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={[styles.tlDot, i === 0 && styles.tlDotOn]} />
                {i < steps.length - 1 ? <View style={styles.tlLine} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Text style={mType.bodyStrong}>{t}</Text>
                <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{d}</Text>
              </View>
            </View>
          ))}
        </View>
        {children}
        <MobileFooterSpacer />
        <View style={{ height: MOBILE_FOOTER_TOP_GAP }} />
        <MobileFooterBleed inset={mGutter} />
      </ScrollView>
    </View>
  );
}

export function useSetupOnLoad(enabled: boolean, start: () => Promise<void>) {
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void start();
  }, [enabled, start]);
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: mGutter, paddingTop: 16 },
  assure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  assureText: { flex: 1, fontSize: 14, color: m.body, lineHeight: 20, ...mFont(400) },
  held: { fontSize: 12.5, color: m.goldDark, lineHeight: 17, marginTop: 6, paddingLeft: 22, ...mFont(400) },
  error: { fontSize: 13, color: m.warn, marginTop: 8, ...mFont(400) },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  terms: { fontSize: 12.5, lineHeight: 18, color: m.muted, marginTop: 18, ...mFont(400) },
  termsLink: {
    color: m.goldDark,
    textDecorationLine: 'underline',
    ...mFont(400),
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', paddingTop: 8, paddingBottom: 8, marginTop: -8, marginBottom: -8 } as object) : null),
  },
  label: { fontSize: 12.5, color: m.muted, marginBottom: 6, ...mFont(400) },
  input: { height: 50, borderWidth: 1, borderColor: m.gold, borderRadius: mRadius.md, paddingHorizontal: 14, fontSize: 16, color: m.ink, ...mFont(400) },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  savedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: mRadius.md, borderWidth: 1, borderColor: m.gold, backgroundColor: m.beige },
  savedCardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: m.white, alignItems: 'center', justifyContent: 'center' },
  savedCardTitle: { fontSize: 15.5, color: m.ink, ...mFont(400) },
  savedCardSub: { fontSize: 12.5, color: m.muted, marginTop: 2, ...mFont(400) },
  sentTo: { fontSize: 13, color: m.muted, marginBottom: 12, ...mFont(400) },
  cardWrap: { minHeight: 120 },
  badge: { width: 52, height: 52, borderRadius: 26, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  badgeText: { color: m.ink, fontSize: 20, ...mFont(400) },
  timeline: { marginTop: 22, marginBottom: 10 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 14, alignItems: 'center' },
  tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: m.gold, backgroundColor: m.white, marginTop: 5 },
  tlDotOn: { backgroundColor: m.gold },
  tlLine: { flex: 1, width: 1, backgroundColor: m.line, marginTop: 4 },
});
