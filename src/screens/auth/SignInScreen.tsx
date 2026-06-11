import React from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { semanticColors, spacing, typography } from '../../constants/theme';
import { BRAND_BYLINE } from '../../constants/themeMode';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'SignIn'>;

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { googleSignIn, appleSignIn, isLoading, error, clearError } = useAuthStore();

  return (
    <WebPageContainer authCard style={styles.container}>
      <Text style={styles.title}>Grapejuice</Text>
      <Text style={styles.byline}>{BRAND_BYLINE}</Text>
      <Text style={styles.subtitle}>Sign in to configure your Hanukkah box.</Text>
      <Text style={styles.hint}>In Expo Go, use email. Google works in a web browser (press w in the terminal).</Text>

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
        textStyle={styles.linkText}
      />

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
  btn: { alignSelf: 'stretch', minWidth: undefined, marginBottom: spacing.md },
  linkText: { fontSize: typography.sm, color: semanticColors.brand },
  error: { color: semanticColors.error, marginTop: spacing.md, textAlign: 'center' },
});
