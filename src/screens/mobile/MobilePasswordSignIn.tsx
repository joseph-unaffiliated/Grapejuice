import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MailBadge } from '../../components/mobile/MobileCodeSignIn';
import { m, mFont, mType, balanceProps } from '../../components/mobile/mobileTheme';

export type PasswordMode = 'password' | 'forgot' | 'forgotSent';

function maskEmail(email: string): string {
  const [user, domain] = email.trim().split('@');
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}•••@${domain}`;
}

/** Phone: password sign-in and reset, for people who made a password before. Codes stay the default. */
export function MobilePasswordSignIn({ mode, setMode, onUseCode }: { mode: PasswordMode; setMode: (m: PasswordMode) => void; onUseCode: () => void }) {
  const { signIn, sendPasswordReset, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    clearError();
    setLocalError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setLocalError('Enter a valid email address.');
    setBusy(true);
    try {
      await fn();
    } catch {
      /* store */
    } finally {
      setBusy(false);
    }
  };

  const shownError = localError ?? error;
  const codeLink = (label: string) => (
    <Pressable onPress={onUseCode} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );

  if (mode === 'forgotSent') {
    return (
      <View style={styles.root}>
        <MailBadge />
        <Text style={[mType.h1, styles.h1]}>Check your email</Text>
        <Text style={styles.lede} {...balanceProps}>If there&apos;s an account for {maskEmail(email)}, we sent a link to reset your password.</Text>
        <MobileButton label="Email me a sign-in code instead" variant="secondary" onPress={onUseCode} style={{ marginTop: 22 }} />
        <Text style={styles.alt}>
          Didn&apos;t get it?{' '}
          <Text style={styles.linkInline} onPress={() => void run(() => sendPasswordReset(email.trim()))}>Send again</Text>
        </Text>
      </View>
    );
  }

  const emailField = (
    <>
      <Text style={styles.label}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#9CA3AF" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" style={styles.input} accessibilityLabel="Email" />
    </>
  );

  if (mode === 'forgot') {
    return (
      <View style={styles.root}>
        <Text style={[mType.h1, styles.h1]}>Reset your password</Text>
        <Text style={styles.lede} {...balanceProps}>We&apos;ll email you a link. Or skip the password and sign in with a code.</Text>
        {emailField}
        {shownError ? <Text style={styles.error}>{shownError}</Text> : null}
        <MobileButton
          label="Send reset link"
          busy={busy}
          height={54}
          style={{ marginTop: 20 }}
          onPress={() =>
            void run(async () => {
              await sendPasswordReset(email.trim());
              setMode('forgotSent');
            })
          }
        />
        <View style={styles.links}>{codeLink('Email me a sign-in code instead')}</View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={[mType.h1, styles.h1]}>Sign in with a password</Text>
      <Text style={styles.lede} {...balanceProps}>If you made one before. Otherwise, use a code.</Text>
      {emailField}
      <Text style={styles.label}>Password</Text>
      <View>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="current-password" textContentType="password" style={[styles.input, { paddingRight: 64 }]} accessibilityLabel="Password" onSubmitEditing={() => void run(() => signIn(email.trim(), password))} />
        <Pressable onPress={() => setShow((v) => !v)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.show} hitSlop={8}>
          <Text style={styles.showText}>{show ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      {shownError ? <Text style={styles.error}>{shownError}</Text> : null}
      <MobileButton label="Sign in" busy={busy} height={54} style={{ marginTop: 20 }} onPress={() => void run(() => signIn(email.trim(), password))} disabled={!password} />
      <View style={styles.links}>
        <Pressable onPress={() => { clearError(); setLocalError(null); setMode('forgot'); }} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
        {codeLink('Email me a code instead')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 30, paddingBottom: 40, backgroundColor: m.white },
  h1: { fontSize: 28, lineHeight: 32 },
  lede: { fontSize: 15, lineHeight: 22, color: m.body, marginTop: 10, marginBottom: 4, ...mFont(300) },
  label: { fontSize: 12.5, color: m.muted, marginTop: 18, marginBottom: 6, ...mFont(400) },
  input: { height: 50, borderWidth: 1, borderColor: m.gold, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: m.ink, backgroundColor: m.white, ...mFont(400) },
  show: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  showText: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  error: { ...mType.small, color: m.warn, marginTop: 10 },
  links: { alignItems: 'center', gap: 8, marginTop: 18 },
  link: { fontSize: 13.5, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  linkInline: { color: m.goldDark, textDecorationLine: 'underline' },
  alt: { fontSize: 13.5, lineHeight: 21, color: m.muted, textAlign: 'center', marginTop: 16, ...mFont(400) },
});
