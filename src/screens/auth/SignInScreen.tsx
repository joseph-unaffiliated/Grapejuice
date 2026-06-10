import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import { BRAND_BYLINE } from '../../constants/themeMode';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'SignIn'>;

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { googleSignIn, isLoading, error, clearError } = useAuthStore();

  return (
    <WebPageContainer authCard style={styles.container}>
      <Text style={styles.title}>Grapejuice</Text>
      <Text style={styles.byline}>{BRAND_BYLINE}</Text>
      <Text style={styles.subtitle}>Sign in to configure your Hanukkah box.</Text>
      <Text style={styles.hint}>In Expo Go, use email. Google works in a web browser (press w in the terminal).</Text>

      <TouchableOpacity
        style={[styles.button, styles.secondary]}
        onPress={() => navigation.navigate('SignInEmail')}
      >
        <Text style={styles.buttonText}>Sign in with email</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.primary]}
        onPress={async () => {
          clearError();
          try {
            await googleSignIn();
          } catch {
            /* store */
          }
        }}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={semanticColors.textPrimary} />
        ) : (
          <Text style={styles.buttonText}>Continue with Google</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
        <Text style={styles.link}>Need an account? Create one</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, paddingTop: spacing.xxl, backgroundColor: semanticColors.bgPrimary },
  title: { fontSize: 28, fontWeight: '700', color: semanticColors.textPrimary },
  byline: { fontSize: typography.sm, color: semanticColors.textTertiary, marginTop: 4 },
  subtitle: { fontSize: typography.lg, color: semanticColors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  hint: { fontSize: typography.sm, color: semanticColors.textTertiary, marginBottom: spacing.lg, lineHeight: 18 },
  button: { paddingVertical: spacing.md, borderRadius: borderRadius.xxl, alignItems: 'center', marginBottom: spacing.md },
  primary: { backgroundColor: semanticColors.brand },
  secondary: { backgroundColor: semanticColors.bgElevated },
  buttonText: { fontSize: typography.xl, fontWeight: '600', color: semanticColors.textPrimary },
  link: { textAlign: 'center', color: semanticColors.brand, marginTop: spacing.md },
  error: { color: semanticColors.error, marginTop: spacing.md },
});
