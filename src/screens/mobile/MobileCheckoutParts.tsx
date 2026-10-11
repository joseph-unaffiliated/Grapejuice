import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useBoxGlance, NOT_HELD_COPY } from '../../hooks/useBoxGlance';
import { trackMeta, metaEventIds } from '../../services/analytics/metaPixel';
import { PAYMENT_ELEMENT_OPTIONS } from '../main/checkout/stripeAppearance';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { BoxSummary } from '../../components/mobile/BoxSummary';
import { OrderSummary, type OrderLine } from '../../components/mobile/OrderSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';

/* ------------------------------------------------------------------ sign-in by code */

type RedeemResult = { status: 'ok'; customToken: string; uid: string } | { status: 'invalid' | 'expired' | 'locked' };

async function requestCode(email: string, createIfMissing = false, firstName?: string): Promise<void> {
  await httpsCallable(functions, 'requestLoginCode')({ email, createIfMissing, firstName, purpose: 'login' });
}
async function redeemCode(email: string, code: string): Promise<RedeemResult> {
  const { data } = await httpsCallable<{ email: string; code: string }, RedeemResult>(functions, 'redeemLoginCode')({ email, code });
  return data;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Six boxes; one hidden input drives them so iOS AutoFill can paste a code. */
export function CodeEntry({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<TextInput>(null);
  const digits = value.replace(/\D/g, '').slice(0, 6);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityRole="button" accessibilityLabel="Enter the 6-digit code" style={styles.codeRow}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[styles.codeBox, i === digits.length && styles.codeBoxCur]}>
          <Text style={styles.codeDigit}>{digits[i] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        ref={ref}
        value={digits}
        onChangeText={(t) => {
          const next = t.replace(/\D/g, '').slice(0, 6);
          onChange(next);
          if (next.length === 6) onComplete?.(next);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        editable={!disabled}
        autoFocus
        style={styles.codeHidden}
        accessibilityLabel="Code"
      />
    </Pressable>
  );
}

/**
 * "Pick up where you left off": the small box summary, then an emailed 6-digit code
 * instead of a password. Signs in with the custom token and refreshes the session.
 */
export function MobileCheckoutGate({ onBack }: { onBack: () => void }) {
  const glance = useBoxGlance();
  const signInWithToken = useAuthStore((s) => s.signInWithToken);
  const guestEmail = useGuestSessionStore((s) => s.pendingAccountEmail || s.interestEmail || '');
  const [email, setEmail] = useState(guestEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    try {
      await requestCode(email.trim(), true);
      setSent(true);
    } catch {
      setError('Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const redeem = async (c: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await redeemCode(email.trim(), c);
      if (r.status !== 'ok') {
        setError(r.status === 'locked' ? 'Too many tries. Send a new code.' : r.status === 'expired' ? 'That code expired. Send a new one.' : "That code didn't match.");
        setCode('');
        return;
      }
      useGuestSessionStore.getState().setPendingAccountEmail('');
      await signInWithToken(r.customToken);
    } catch {
      setError('Could not sign you in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader back={{ label: 'Box', onPress: onBack }} title="Checkout" right={<Secure />} />
      <ScrollView contentContainerStyle={styles.gate} keyboardShouldPersistTaps="handled">
        <Text style={mType.h1}>Pick up where you left off</Text>
        <Text style={[mType.body, { marginTop: 8 }]}>{sent ? 'Enter the code we just sent.' : "Your box is saved to your email. We'll send a 6-digit code to sign you in. No password needed."}</Text>
        <View style={{ marginVertical: 20 }}>
          <BoxSummary size="sm" total={glance.totalLabel} items={glance.thumbs} />
        </View>
        {sent ? (
          <>
            <Text style={styles.sentTo}>
              Sent to {email} ·{' '}
              <Text style={styles.link} onPress={() => { setSent(false); setCode(''); }}>
                Change
              </Text>
            </Text>
            <CodeEntry value={code} onChange={setCode} onComplete={(c) => void redeem(c)} disabled={busy} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={[styles.sentTo, { marginTop: 14 }]}>
              Didn't get it?{' '}
              <Text style={styles.link} onPress={() => void send()}>
                Send again
              </Text>
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" style={styles.input} accessibilityLabel="Email" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <MobileButton label="Email me a code" onPress={() => void send()} busy={busy} style={{ marginTop: 14 }} />
          </>
        )}
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

/* ------------------------------------------------------------------ one-page checkout */

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
  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader back={{ label: 'Box', onPress: p.onBack }} title="Checkout" right={<Secure />} />
      <ScrollView contentContainerStyle={{ paddingBottom: STICKY_BAR_CLEARANCE + 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          <View style={styles.assure}>
            <Icon icon={icons.calendar} size={14} color={m.goldDark} />
            <Text style={styles.assureText}>Not charged until it ships · change anything until {p.lockShort}</Text>
          </View>
          {!p.cardOnFile ? <Text style={styles.held}>{NOT_HELD_COPY}</Text> : null}
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
              totalLabel="Charged when it ships"
              total={p.total}
            >
              {open ? p.receipt : null}
            </OrderSummary>
          </View>
          {p.discount}
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
          <Text style={mType.h2}>Payment</Text>
          <Text style={[mType.small, { marginTop: 4, marginBottom: 12 }]}>Saved now, charged when your box ships.</Text>
          {p.payment}
        </View>
      </ScrollView>
      {p.bar}
    </View>
  );
}

/**
 * Inside <Elements>: the Stripe card form and the Place order bar. Place order checks
 * the address first (passed in), then confirms the SetupIntent, then hands off to the
 * existing card-saved flow that waits for the webhook and commits the box.
 */
export function MobileCardAndPlaceOrder({
  total,
  beforeConfirm,
  onSaved,
  returnUrl,
  disabled,
  notify,
}: {
  total: string;
  beforeConfirm: () => Promise<boolean>;
  onSaved: () => void;
  returnUrl?: string;
  disabled?: boolean;
  notify: (title: string, body: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
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
        <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />
      </View>
      <StickyBar label="Charged when it ships" total={total} layout="stack" cta={{ label: 'Place order', onPress: () => void place(), busy: saving, disabled: disabled || saving || !stripe || !elements }} testID="mobile-checkout-bar" />
    </>
  );
}

/* ------------------------------------------------------------------ confirmation */

export function MobileCheckoutDone({ lockShort, startsLabel, onViewBox, onShop }: { lockShort: string; startsLabel: string | null; onViewBox: () => void; onShop: () => void }) {
  const steps: [string, string][] = [
    ['Today', 'Order placed. Card saved, not charged.'],
    [`Until ${lockShort}`, 'Swap, add or remove anything in My Box.'],
    [`End of ${lockShort}`, 'Your box locks and we start packing.'],
    ['When it ships', 'Your card is charged and we email you tracking.'],
    [startsLabel ? `Before ${startsLabel}` : 'Before the first night', 'It arrives in time for the first candle.'],
  ];
  const ics = () => {
    if (Platform.OS !== 'web') return;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:Last day to change your Grapejuice Hanukkah box`, `DESCRIPTION:Open grapejuice.co/box to make any last changes.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    void Linking.openURL(`data:text/calendar;charset=utf8,${encodeURIComponent(body)}`);
  };
  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader />
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: 28, paddingBottom: 40 }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓</Text>
        </View>
        <Text style={mType.h1}>Your box is set</Text>
        <Text style={[mType.body, { marginTop: 8 }]}>You can change anything until {lockShort}. Nothing is charged until it ships.</Text>
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
        <MobileButton label="View my box" onPress={onViewBox} />
        <MobileButton label="Shop extras" variant="secondary" onPress={onShop} style={{ marginTop: 10 }} />
        <Pressable onPress={ics} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 16 }}>
          <Text style={styles.link}>Add {lockShort} to my calendar</Text>
        </Pressable>
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
  gate: { paddingHorizontal: mGutter, paddingTop: 22, paddingBottom: 40 },
  assure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  assureText: { flex: 1, fontSize: 14, color: m.body, lineHeight: 20, ...mFont(400) },
  held: { fontSize: 12.5, color: m.goldDark, lineHeight: 17, marginTop: 6, paddingLeft: 22, ...mFont(400) },
  error: { fontSize: 13, color: m.warn, marginTop: 8, ...mFont(400) },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  label: { fontSize: 12.5, color: m.muted, marginBottom: 6, ...mFont(400) },
  input: { height: 50, borderWidth: 1, borderColor: m.gold, borderRadius: mRadius.md, paddingHorizontal: 14, fontSize: 16, color: m.ink, ...mFont(400) },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  sentTo: { fontSize: 13, color: m.muted, marginBottom: 12, ...mFont(400) },
  codeRow: { flexDirection: 'row', gap: 8, position: 'relative' },
  codeBox: { flex: 1, height: 54, borderWidth: 1, borderColor: m.line, borderRadius: mRadius.md, alignItems: 'center', justifyContent: 'center' },
  codeBoxCur: { borderColor: m.goldDark, borderWidth: 2 },
  codeDigit: { fontSize: 22, color: m.ink, ...mFont(500) },
  codeHidden: { position: 'absolute', opacity: 0.01, left: 0, top: 0, width: '100%', height: 54 },
  cardWrap: { minHeight: 120 },
  badge: { width: 52, height: 52, borderRadius: 26, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  badgeText: { color: m.ink, fontSize: 24, ...mFont(700) },
  timeline: { marginTop: 22, marginBottom: 10 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 14, alignItems: 'center' },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: m.line, marginTop: 6 },
  tlDotOn: { backgroundColor: m.gold },
  tlLine: { flex: 1, width: 1, backgroundColor: m.line, marginTop: 4 },
});
