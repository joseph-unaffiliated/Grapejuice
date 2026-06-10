import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
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
      <TouchableOpacity
        style={styles.button}
        onPress={async () => {
          clearError();
          await signUp(email.trim(), password, name);
        }}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign up</Text>}
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, paddingTop: spacing.xxl, backgroundColor: semanticColors.bgPrimary },
  title: { fontSize: typography.headerLg, fontWeight: '700', marginBottom: spacing.sm },
  hint: { fontSize: typography.sm, color: semanticColors.textTertiary, marginBottom: spacing.lg, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: 16,
  },
  button: { backgroundColor: semanticColors.brand, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  buttonText: { fontWeight: '600', color: semanticColors.textInverse },
  error: { color: semanticColors.error, marginTop: spacing.md },
});
