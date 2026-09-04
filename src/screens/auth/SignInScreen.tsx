import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
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
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const claimGift = pendingReturn === 'GiftClaim';

  return (
    <AuthHeroShell>
      <View style={styles.actions}>
        {claimGift ? (
          <View style={styles.claimCopy}>
            <Text style={[styles.claimTitle, { color: colors.textPrimary }]}>
              Sign in to claim your gift
            </Text>
            <Text style={[styles.claimBody, { color: colors.textSecondary }]}>
              Use the recipient family account to claim gift credit or a curated gift box.
            </Text>
          </View>
        ) : null}

        <GrapejuiceButton
          label="Continue with Google"
          variant="pill"
          onPress={async () => {
            clearError();
            try {
              // Survives the redirect round-trip so nav sign-in stays in place.
              await googleSignIn(pendingReturn === 'Stay' ? 'Stay' : undefined);
            } catch {
              /* store */
            }
          }}
          disabled={isLoading}
          loading={isLoading}
          style={styles.btn}
        />

        <GrapejuiceButton
          label="Sign in with Email"
          variant="pill"
          onPress={() => navigation.navigate('SignInEmail')}
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

        <View style={styles.signUpRow}>
          <Text style={[styles.signUpMuted, { color: colors.textPrimary }]}>
            Don&apos;t have an account?{' '}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            accessibilityRole="button"
            accessibilityLabel="Sign up"
          >
            <Text style={[styles.signUpLink, { color: colors.goldMuted }]}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </AuthHeroShell>
  );
}

const styles = StyleSheet.create({
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  claimCopy: {
    width: '100%',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  claimTitle: {
    fontSize: typography.xl,
    ...typeface('bold'),
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  claimBody: {
    fontSize: typography.md,
    ...typeface('regular'),
    textAlign: 'center',
    lineHeight: 22,
  },
  btn: {
    alignSelf: 'stretch',
  },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md,
    flexWrap: 'wrap',
  },
  signUpMuted: {
    fontSize: typography.sm,
    ...typeface('regular'),
    letterSpacing: -0.22,
  },
  signUpLink: {
    fontSize: typography.sm,
    ...typeface('regular'),
    letterSpacing: -0.22,
  },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
});
