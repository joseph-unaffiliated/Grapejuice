import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { m, mType, mFont, balanceProps } from './mobileTheme';
import { MobileButton } from './MobileButton';

type RedeemResult = { status: 'ok'; customToken: string } | { status: 'invalid' | 'expired' | 'locked' };

async function requestCode(email: string, createIfMissing: boolean): Promise<void> {
  await httpsCallable(functions, 'requestLoginCode')({ email, createIfMissing, purpose: 'login' });
}
async function redeemCode(email: string, code: string): Promise<RedeemResult> {
  const { data } = await httpsCallable<{ email: string; code: string }, RedeemResult>(functions, 'redeemLoginCode')({ email, code });
  return data;
}
function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

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

type Props = {
  title: string;
  lead?: string;
  /** Sign-up flavour: unknown emails get a passwordless account so the code can sign them in. */
  createIfMissing?: boolean;
  /** Rendered between the lead and the form (e.g. a box summary). */
  children?: React.ReactNode;
  /** Rendered under the form (e.g. "or continue with Google"). */
  footer?: React.ReactNode;
  onSignedIn?: () => void;
  style?: object;
};

/**
 * Passwordless sign-in for the phone layouts: email → 6-digit code → custom token.
 * Shared by the checkout gate, the sign-in screen and the account page's guest state.
 */
export function MobileCodeSignIn({ title, lead, createIfMissing = true, children, footer, onSignedIn, style }: Props) {
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
      await requestCode(email.trim(), createIfMissing);
      setSent(true);
      setCode('');
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
      onSignedIn?.();
    } catch {
      setError('Could not sign you in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, style]}>
      <Text style={mType.h1} {...balanceProps}>{title}</Text>
      <Text style={[mType.body, { marginTop: 8 }]}>
        {sent ? 'Enter the code we just sent.' : lead ?? "We'll email you a 6-digit code. No password needed."}
      </Text>
      {children}
      {sent ? (
        <>
          <Text style={styles.sentTo}>
            Sent to {email} ·{' '}
            <Text style={styles.link} onPress={() => { setSent(false); setCode(''); setError(null); }}>
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
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.input}
            accessibilityLabel="Email"
            onSubmitEditing={() => void send()}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <MobileButton label="Email me a code" onPress={() => void send()} busy={busy} style={{ marginTop: 14 }} />
        </>
      )}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, backgroundColor: m.white },
  label: { ...mType.small, color: m.ink, marginTop: 20, marginBottom: 6, ...mFont(500) },
  input: { height: 48, borderWidth: 1, borderColor: m.line, borderRadius: 10, paddingHorizontal: 14, fontSize: 16, color: m.ink, ...mFont(400) },
  sentTo: { ...mType.small, marginTop: 20, marginBottom: 10 },
  link: { color: m.goldDark, textDecorationLine: 'underline' },
  error: { ...mType.small, color: m.warn, marginTop: 10 },
  codeRow: { flexDirection: 'row', gap: 8, position: 'relative' },
  codeBox: { flex: 1, height: 54, borderWidth: 1, borderColor: m.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  codeBoxCur: { borderColor: m.goldDark, borderWidth: 2 },
  codeDigit: { fontSize: 22, color: m.ink, ...mFont(500) },
  codeHidden: { position: 'absolute', opacity: 0.01, left: 0, top: 0, width: '100%', height: 54 },
});
