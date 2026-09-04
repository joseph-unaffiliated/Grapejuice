import React, { useEffect, useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  Platform,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

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
  const route = useRoute<RouteProp<AuthStackParamList, 'SignInEmail'>>();
  const restoreSignInEmail = useAuthFlowStore((s) => s.restoreSignInEmail);
  const clearRestoreSignInEmail = useAuthFlowStore((s) => s.clearRestoreSignInEmail);
  const [email, setEmail] = useState(
    () => restoreSignInEmail ?? route.params?.email ?? ''
  );
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

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
    try {
      await signIn(e, password);
    } catch {
      /* store surfaces error */
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
  hint: {
    fontSize: typography.sm,
    ...typeface('light'),
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
