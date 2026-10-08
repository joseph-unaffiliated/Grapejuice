import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { GoogleAuthButton } from '../../components/auth/GoogleAuthButton';
import { spacing, typography, typeface } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'SignIn'>;

export function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { googleSignIn, appleSignIn, error, clearError } = useAuthStore();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const claimGift = pendingReturn === 'GiftClaim';

  return (
    <AuthHeroShell>
      <View style={styles.actions}>
        {claimGift ? (
          <View style={styles.claimCopy}>
            <Text style={[styles.claimTitle, { color: colors.textPrimary }]}>
              Log in to claim your gift
            </Text>
            <Text style={[styles.claimBody, { color: colors.textSecondary }]}>
              Use the recipient family account to claim gift credit or a curated gift box.
            </Text>
          </View>
        ) : null}

        <GoogleAuthButton
          onPress={async () => {
            clearError();
            setBusy('google');
            try {
              // Survives the redirect round-trip so nav sign-in stays in place.
              await googleSignIn(pendingReturn === 'Stay' ? 'Stay' : undefined);
            } catch {
              /* store */
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy !== null}
          loading={busy === 'google'}
          style={styles.btn}
        />

        <GrapejuiceButton
          label="Log in with Email"
          variant="pill"
          onPress={() => navigation.navigate('SignInEmail')}
          style={styles.btn}
        />

        {Platform.OS === 'ios' ? (
          <GrapejuiceButton
            label="Log in with Apple"
            variant="pill"
            onPress={async () => {
              clearError();
              setBusy('apple');
              try {
                await appleSignIn();
              } catch {
                /* store */
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null}
            loading={busy === 'apple'}
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
