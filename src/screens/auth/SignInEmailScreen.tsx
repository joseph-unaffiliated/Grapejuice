import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

export function SignInEmailScreen() {
  const { signIn, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <WebPageContainer authCard style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <GrapejuiceButton
        label="Sign in"
        variant="filled"
        onPress={async () => {
          clearError();
          await signIn(email.trim(), password);
        }}
        disabled={isLoading}
        loading={isLoading}
        style={styles.btn}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, paddingTop: spacing.xxl, backgroundColor: semanticColors.bgPrimary },
  title: { fontSize: typography.headerLg, fontWeight: '700', marginBottom: spacing.lg, color: semanticColors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: 16,
  },
  btn: { alignSelf: 'stretch', minWidth: undefined },
  error: { color: semanticColors.error, marginTop: spacing.md },
});
