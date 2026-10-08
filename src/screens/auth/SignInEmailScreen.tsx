import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';
import { requestLoginLink } from '../../services/auth/loginLinks';
import { isValidEmail } from '../../utils/formValidation';

/** RN Web autofill often fills the DOM without firing onChangeText — sync from the native event too. */
function readInputValue(
  e: NativeSyntheticEvent<TextInputChangeEventData> | { nativeEvent?: { text?: string }; target?: { value?: string } },
): string | null {
  const fromNative = e?.nativeEvent?.text;
  if (typeof fromNative === 'string') return fromNative;
  const fromTarget = (e as { target?: { value?: string } })?.target?.value;
  if (typeof fromTarget === 'string') return fromTarget;
  return null;
}

export function SignInEmailScreen() {
  const { colors } = useThemeMode();
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const { signIn, googleSignIn, error, clearError } = useAuthStore();
  const route = useRoute<RouteProp<AuthStackParamList, 'SignInEmail'>>();
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const restoreSignInEmail = useAuthFlowStore((s) => s.restoreSignInEmail);
  const clearRestoreSignInEmail = useAuthFlowStore((s) => s.clearRestoreSignInEmail);
  const [email, setEmail] = useState(
    () => restoreSignInEmail ?? route.params?.email ?? ''
  );
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  /** Which button is working — each shows its own spinner. */
  const [busy, setBusy] = useState<'password' | 'google' | 'link' | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    if (restoreSignInEmail) clearRestoreSignInEmail();
  }, [restoreSignInEmail, clearRestoreSignInEmail]);

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
  ];

  const onSubmit = async () => {
    clearError();
    setLocalError(null);
    const e = email.trim();
    if (!e || !password) {
      setLocalError(
        'Enter both email and password. If the fields look filled, click them once so the values register, then try again.',
      );
      return;
    }
    setBusy('password');
    try {
      await signIn(e, password);
    } catch {
      /* store surfaces error */
    } finally {
      setBusy(null);
    }
  };

  const onEmailLink = async () => {
    clearError();
    setLocalError(null);
    const e = email.trim();
    if (!isValidEmail(e)) {
      setLocalError('Enter the email for your account and we’ll send you a login link.');
      return;
    }
    setBusy('link');
    try {
      const here =
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : undefined;
      await requestLoginLink({ email: e, next: here && here !== '/login' ? here : undefined });
      setLinkSent(true);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setLocalError(
        code.endsWith('resource-exhausted')
          ? 'Too many tries. Please wait a few minutes and try again.'
          : 'We couldn’t send a login link. Please try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthHeroShell>
      <TextInput
        style={inputStyle}
        placeholder="Email"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        onChange={(e) => {
          const v = readInputValue(e);
          if (v != null) setEmail(v);
        }}
      />
      <TextInput
        style={inputStyle}
        placeholder="Password"
        placeholderTextColor={colors.textTertiary}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onChange={(e) => {
          const v = readInputValue(e);
          if (v != null) setPassword(v);
        }}
        onSubmitEditing={() => void onSubmit()}
      />
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('ForgotPassword', { email: email.trim() || undefined })
        }
        style={styles.forgotHit}
        accessibilityRole="button"
        accessibilityLabel="Forgot password"
      >
        <Text style={[styles.forgotLink, { color: colors.goldMuted }]}>Forgot password?</Text>
      </TouchableOpacity>
      <GrapejuiceButton
        label="Log In"
        variant="filled"
        onPress={() => void onSubmit()}
        disabled={busy !== null}
        loading={busy === 'password'}
        style={styles.btn}
      />
      {linkSent ? (
        <Text style={[styles.linkSent, { color: colors.textSecondary }]}>
          If there’s an account for {email.trim()}, a login link is on its way. Check your inbox.
        </Text>
      ) : (
        <GrapejuiceButton
          label="Email me a login link"
          variant="pillOutline"
          onPress={() => void onEmailLink()}
          disabled={busy !== null}
          loading={busy === 'link'}
          style={styles.btn}
        />
      )}
      {localError || error ? (
        <Text style={[styles.error, { color: colors.error }]}>{localError || error}</Text>
      ) : null}
      <View
        style={[styles.goldDivider, { backgroundColor: colors.border }]}
        accessibilityRole="none"
      />
      <GrapejuiceButton
        label="Continue with Google"
        variant="pill"
        onPress={async () => {
          clearError();
          setBusy('google');
          try {
            await googleSignIn(pendingReturn === 'Stay' ? 'Stay' : undefined);
          } catch {
            /* store */
          } finally {
            setBusy(null);
          }
        }}
        disabled={busy !== null}
        loading={busy === 'google'}
        style={styles.btn}
      />
    </AuthHeroShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: spacing.sm,
    fontSize: 15,
    lineHeight: 20,
    ...typeface('regular'),
  },
  forgotHit: {
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  forgotLink: {
    ...typeface('regular'),
    fontSize: typography.sm,
  },
  btn: { alignSelf: 'stretch', marginTop: spacing.xs },
  goldDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.lg,
  },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
  linkSent: {
    ...typeface('regular'),
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: typography.md,
    lineHeight: 20,
  },
});
