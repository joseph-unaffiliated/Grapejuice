import React, { useState } from 'react';
import { Text, TextInput, StyleSheet, Platform, type NativeSyntheticEvent, type TextInputChangeEventData } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';

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
  const { signIn, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

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
    try {
      await signIn(e, password);
    } catch {
      /* store surfaces error */
    }
  };

  return (
    <AuthHeroShell>
      <Text style={[styles.headline, { color: colors.textPrimary }]}>Sign in</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Use the email and password for your Grapejuice account.
      </Text>

      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
        ]}
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
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
        ]}
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
      <GrapejuiceButton
        label="Sign in"
        variant="filled"
        onPress={() => void onSubmit()}
        disabled={isLoading}
        loading={isLoading}
        style={styles.btn}
      />
      {localError || error ? (
        <Text style={[styles.error, { color: colors.error }]}>{localError || error}</Text>
      ) : null}
      {Platform.OS === 'web' ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Signed up with Google? Use Continue with Google on the previous screen instead.
        </Text>
      ) : null}
    </AuthHeroShell>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: typography.headerLg,
    ...typeface('medium'),
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.md,
    ...typeface('light'),
    letterSpacing: -0.22,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: 16,
    ...typeface('regular'),
  },
  btn: { alignSelf: 'stretch', minWidth: undefined },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
  hint: {
    fontSize: typography.sm,
    ...typeface('light'),
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
