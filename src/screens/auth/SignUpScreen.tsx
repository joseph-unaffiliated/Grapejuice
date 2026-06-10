import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

export function SignUpScreen() {
  const { signUp, isLoading, error, clearError } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <WebPageContainer authCard style={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.hint}>Password must be at least 6 characters. Use any email you can access.</Text>
      <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <GrapejuiceButton
        label="Sign up"
        variant="filled"
        onPress={async () => {
          clearError();
          await signUp(email.trim(), password, name);
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
  title: { fontSize: typography.headerLg, fontWeight: '700', marginBottom: spacing.sm, color: semanticColors.textPrimary },
  hint: { fontSize: typography.sm, color: semanticColors.textTertiary, marginBottom: spacing.lg, lineHeight: 18 },
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
