import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { GrapejuiceButton } from '../ui/GrapejuiceButton';
import { useThemeMode } from '../../context/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { useAuthFlowStore } from '../../stores/authFlowStore';
import type { AuthReturnRoute } from '../../stores/authFlowStore';
import { spacing, typography, tabBarTotalHeight } from '../../constants/theme';

type Props = {
  returnTo?: AuthReturnRoute;
  showBack?: boolean;
  onBack?: () => void;
};

/** Figma 366:954 — guest Account / profile auth prompt. */
export function GuestAuthPrompt({ returnTo = 'Account', showBack = false, onBack }: Props) {
  const { colors } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { googleSignIn, isLoading, error, clearError } = useAuthStore();
  const startAuth = useAuthFlowStore((s) => s.startAuthFromGuest);
  const [googleBusy, setGoogleBusy] = useState(false);

  const bottomPad = tabBarTotalHeight(Math.max(insets.bottom, 0)) + spacing.lg;

  const onGoogle = async () => {
    clearError();
    setGoogleBusy(true);
    try {
      // Pass returnTo for redirect flows (sessionStorage). Do not startAuth() —
      // that sets pendingReturn and flips RootNavigator into the Auth stack.
      await googleSignIn(returnTo);
    } catch {
      /* surfaced via store */
    } finally {
      setGoogleBusy(false);
    }
  };

  const busy = isLoading || googleBusy;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgPrimary, paddingBottom: bottomPad }]}>
      {showBack && onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Text style={[styles.backText, { color: colors.textSecondary }]}>← Back</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.center}>
        <GrapejuiceBrandMark />

        <View style={styles.actions}>
          <GrapejuiceButton
            label="Continue with Google"
            variant="pill"
            onPress={() => void onGoogle()}
            disabled={busy}
            loading={busy}
            style={styles.pillBtn}
          />

          <GrapejuiceButton
            label="Sign in with Email"
            variant="pill"
            onPress={() => startAuth(returnTo, 'signin', 'SignInEmail')}
            disabled={busy}
            style={styles.pillBtn}
          />

          <View style={styles.signUpRow}>
            <Text style={[styles.signUpMuted, { color: colors.textPrimary }]}>Don&apos;t have an account? </Text>
            <TouchableOpacity
              onPress={() => startAuth(returnTo, 'signup', 'SignUp')}
              accessibilityRole="button"
              accessibilityLabel="Sign up"
            >
              <Text style={[styles.signUpLink, { color: colors.goldMuted }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  backText: { fontSize: typography.lg, fontWeight: '500' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: 64,
  },
  actions: { width: '100%', alignItems: 'center', gap: spacing.sm },
  pillBtn: { minWidth: 220 },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md,
    flexWrap: 'wrap',
  },
  signUpMuted: { fontSize: typography.sm, letterSpacing: -0.22 },
  signUpLink: { fontSize: typography.sm, fontWeight: '400', letterSpacing: -0.22 },
  error: {
    textAlign: 'center',
    fontSize: typography.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
