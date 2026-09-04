import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
} from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { useMockFlowStore, suggestPlusAlias } from '../../stores/mockFlowStore';
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

export function SignUpEmailScreen() {
  const { colors } = useThemeMode();
  const { signUp, isLoading, error, clearError } = useAuthStore();
  const mockActive = useMockFlowStore((s) => s.active);
  const adminEmail = useMockFlowStore((s) => s.restore?.adminEmail ?? null);
  const plusHint = mockActive ? suggestPlusAlias(adminEmail) : null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
  ];

  const onSubmit = async () => {
    clearError();
    setLocalError(null);
    const e = email.trim();
    if (!e || !password) {
      setLocalError('Enter email and password (at least 6 characters).');
      return;
    }
    try {
      await signUp(e, password, name);
    } catch {
      /* store surfaces error */
    }
  };

  return (
    <AuthHeroShell>
      <TextInput
        style={inputStyle}
        placeholder="Your name"
        placeholderTextColor={colors.textTertiary}
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
        onChange={(ev) => {
          const v = readInputValue(ev);
          if (v != null) setName(v);
        }}
      />
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
        onChange={(ev) => {
          const v = readInputValue(ev);
          if (v != null) setEmail(v);
        }}
      />
      <TextInput
        style={inputStyle}
        placeholder="Password"
        placeholderTextColor={colors.textTertiary}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
        onChange={(ev) => {
          const v = readInputValue(ev);
          if (v != null) setPassword(v);
        }}
        onSubmitEditing={() => void onSubmit()}
      />
      <GrapejuiceButton
        label="Sign up"
        variant="filled"
        onPress={() => void onSubmit()}
        disabled={isLoading}
        loading={isLoading}
        style={styles.btn}
      />
      {plusHint ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          Visitor playthrough: use {plusHint} (or another plus-alias) so mail still hits your inbox.
          Do not sign up with your admin address.
        </Text>
      ) : null}
      {localError || error ? (
        <Text style={[styles.error, { color: colors.error }]}>{localError || error}</Text>
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
  hint: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.sm,
    ...typeface('light'),
    lineHeight: 18,
  },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
});
