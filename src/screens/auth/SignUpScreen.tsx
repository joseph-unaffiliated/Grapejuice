import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useAuthStore } from '../../stores/authStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';

export function SignUpScreen() {
  const { colors } = useThemeMode();
  const { signUp, googleSignIn, isLoading, error, clearError } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <AuthHeroShell>
      <Text style={[styles.headline, { color: colors.textPrimary }]}>Create account</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Password must be at least 6 characters. Use any email you can access.
      </Text>

      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
        ]}
        placeholder="Your name"
        placeholderTextColor={colors.textTertiary}
        autoComplete="name"
        value={name}
        onChangeText={setName}
      />
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
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bgPrimary },
        ]}
        placeholder="Password"
        placeholderTextColor={colors.textTertiary}
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />
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

      <View style={styles.orRow}>
        <View style={[styles.orLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.orText, { color: colors.textTertiary }]}>or</Text>
        <View style={[styles.orLine, { backgroundColor: colors.border }]} />
      </View>

      <GrapejuiceButton
        label="Sign up with Google"
        variant="pillOutline"
        onPress={async () => {
          clearError();
          try {
            await googleSignIn();
          } catch {
            /* store */
          }
        }}
        disabled={isLoading}
        loading={isLoading}
        style={styles.btn}
      />

      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
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
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
    alignSelf: 'stretch',
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  orText: {
    fontSize: typography.sm,
    ...typeface('light'),
  },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
});
