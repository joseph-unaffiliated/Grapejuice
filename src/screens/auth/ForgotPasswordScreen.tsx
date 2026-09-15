import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

function readInputValue(
  e: NativeSyntheticEvent<TextInputChangeEventData> | { nativeEvent?: { text?: string }; target?: { value?: string } },
): string | null {
  const fromNative = e?.nativeEvent?.text;
  if (typeof fromNative === 'string') return fromNative;
  const fromTarget = (e as { target?: { value?: string } })?.target?.value;
  if (typeof fromTarget === 'string') return fromTarget;
  return null;
}

export function ForgotPasswordScreen() {
  const { colors } = useThemeMode();
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ForgotPassword'>>();
  const { sendPasswordReset, error, clearError } = useAuthStore();
  const [email, setEmail] = useState(() => route.params?.email ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
  ];

  const onSubmit = async () => {
    clearError();
    setLocalError(null);
    const e = email.trim();
    if (!e) {
      setLocalError('Enter the email for your account.');
      return;
    }
    setSending(true);
    try {
      await sendPasswordReset(e);
      setSent(true);
    } catch {
      /* store surfaces error */
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthHeroShell>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Forgot password</Text>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        {sent
          ? 'If an account exists for that email, we sent a reset link from Grapejuice. Check your inbox (and spam), then choose a new password on our site.'
          : 'Enter your email and we’ll send a Grapejuice link to reset your password.'}
      </Text>

      {!sent ? (
        <>
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
            onSubmitEditing={() => void onSubmit()}
          />
          <GrapejuiceButton
            label="Send reset link"
            variant="filled"
            onPress={() => void onSubmit()}
            disabled={sending}
            loading={sending}
            style={styles.btn}
          />
        </>
      ) : (
        <GrapejuiceButton
          label="Back to log in"
          variant="filled"
          onPress={() => navigation.navigate('SignInEmail', { email: email.trim() || undefined })}
          style={styles.btn}
        />
      )}

      {localError || error ? (
        <Text style={[styles.error, { color: colors.error }]}>{localError || error}</Text>
      ) : null}

      {!sent ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('SignInEmail', { email: email.trim() || undefined })}
          style={styles.backHit}
          accessibilityRole="button"
          accessibilityLabel="Back to log in"
        >
          <Text style={[styles.backLink, { color: colors.goldMuted }]}>Back to log in</Text>
        </TouchableOpacity>
      ) : null}
    </AuthHeroShell>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typeface('medium'),
    fontSize: typography.xxl,
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  lead: {
    ...typeface('regular'),
    fontSize: typography.md,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
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
  btn: { alignSelf: 'stretch', marginTop: spacing.xs },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
  backHit: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  backLink: {
    ...typeface('regular'),
    fontSize: typography.md,
  },
});
