import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { useThemeMode } from '../../context/ThemeContext';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'SignUp'>;

export function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { googleSignIn, appleSignIn, isLoading, error, clearError } = useAuthStore();
  const mockActive = useMockFlowStore((s) => s.active);
  const pendingReturn = useAuthFlowStore((s) => s.pendingReturn);
  const claimGift = pendingReturn === 'GiftClaim';

  return (
    <AuthHeroShell>
      <View style={styles.actions}>
        {claimGift ? (
          <View style={styles.claimCopy}>
            <Text style={[styles.claimTitle, { color: colors.textPrimary }]}>
              Sign up to claim your gift
            </Text>
            <Text style={[styles.claimBody, { color: colors.textSecondary }]}>
              Create an account to claim your gift — gift credit or a curated gift box from someone
              who loves you.
            </Text>
          </View>
        ) : null}

        <GrapejuiceButton
          label="Continue with Google"
          variant="pill"
          onPress={async () => {
            clearError();
            try {
              // Survives the redirect round-trip so nav sign-up stays in place.
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
          label="Sign up with Email"
          variant="pill"
          onPress={() => navigation.navigate('SignUpEmail')}
          style={styles.btn}
        />

        {mockActive ? (
          <Text style={[styles.playthroughHint, { color: colors.textTertiary }]}>
            Visitor playthrough: use Sign up with Email and a plus-alias. Continue with Google as
            yourself lands on the admin household.
          </Text>
        ) : null}

        {Platform.OS === 'ios' ? (
          <GrapejuiceButton
            label="Sign up with Apple"
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

        <View style={styles.signInRow}>
          <Text style={[styles.signInMuted, { color: colors.textPrimary }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SignIn')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.signInLink, { color: colors.goldMuted }]}>Sign in</Text>
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
    minWidth: undefined,
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md,
    flexWrap: 'wrap',
  },
  signInMuted: {
    fontSize: typography.sm,
    ...typeface('regular'),
    letterSpacing: -0.22,
  },
  signInLink: {
    fontSize: typography.sm,
    ...typeface('regular'),
    letterSpacing: -0.22,
  },
  error: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.md,
  },
  playthroughHint: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: typography.sm,
    ...typeface('light'),
    lineHeight: 18,
  },
});
