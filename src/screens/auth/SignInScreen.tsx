import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'SignIn'>;

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { googleSignIn, appleSignIn, isLoading, error, clearError } = useAuthStore();

  return (
    <AuthHeroShell>
      <Text style={[styles.headline, { color: colors.textPrimary }]}>Sign in</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Configure your Hanukkah box and pick up where you left off.
      </Text>

      <View style={styles.actions}>
        <GrapejuiceButton
          label="Sign in with email"
          variant="pill"
          onPress={() => navigation.navigate('SignInEmail')}
          style={styles.btn}
        />

        <GrapejuiceButton
          label="Continue with Google"
          variant="pill"
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

        {Platform.OS === 'ios' ? (
          <GrapejuiceButton
            label="Sign in with Apple"
            variant="pill"
            onPress={async () => {
              clearError();
              try {
                await appleSignIn();
              } catch {
                /* store */
              }
            }}
            disabled={isLoading}
            loading={isLoading}
            style={styles.btn}
          />
        ) : null}

        <GrapejuiceButton
          label="Need an account? Create one"
          variant="pillOutline"
          onPress={() => navigation.navigate('SignUp')}
          style={styles.btn}
        />
      </View>

      {__DEV__ ? (
        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {Platform.OS === 'web'
            ? 'Google works best in Chrome. In Cursor’s browser, email sign-in is the reliable fallback.'
            : 'In Expo Go, use email. Google works in a web browser (press w in the terminal).'}
        </Text>
      ) : null}

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
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  btn: {
    alignSelf: 'stretch',
    minWidth: undefined,
  },
  hint: {
    fontSize: typography.sm,
    ...typeface('light'),
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
});
