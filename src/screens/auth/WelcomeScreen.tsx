import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useThemeMode } from '../../context/ThemeContext';
import { useFirebaseReady } from '../../hooks/useFirebaseReady';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { AuthHeroShell } from '../../components/auth/AuthHeroShell';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography, typeface } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { ready, error, projectId } = useFirebaseReady();
  const startExplore = useGuestSessionStore((s) => s.startExplore);
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);
  const { appleSignIn, isLoading, clearError } = useAuthStore();

  return (
    <AuthHeroShell>
      <Text style={[styles.headline, { color: colors.textSecondary }]}>
        A Hanukkah box for families who want to celebrate — and need help knowing how.
      </Text>

      {__DEV__ ? (
        <Text style={[styles.firebase, { color: ready ? colors.success : colors.warning }]}>
          Firebase {projectId ? `(${projectId})` : ''}:{' '}
          {ready ? 'connected' : error ? 'setup needed' : 'checking…'}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <GrapejuiceButton
          label="Explore Grapejuice"
          variant="filled"
          onPress={() => startExplore()}
          style={styles.btn}
        />
        <GrapejuiceButton
          label="Build your Hanukkah box"
          variant="pillOutline"
          onPress={() => startBuildBox()}
          style={styles.btn}
        />

        <TouchableOpacity
          onPress={() => navigation.navigate('SignIn')}
          style={styles.loginBtn}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          <Text style={[styles.loginText, { color: colors.brand }]}>Log in</Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' ? (
          <GrapejuiceButton
            label="Sign in with Apple"
            variant="pillOutline"
            onPress={async () => {
              clearError();
              try {
                await appleSignIn();
              } catch {
                /* store */
              }
            }}
            disabled={isLoading}
            style={styles.btn}
          />
        ) : null}

        {__DEV__ ? (
          <TouchableOpacity onPress={() => startExplore()} style={styles.devBtn}>
            <Text style={[styles.devText, { color: colors.textTertiary }]}>Dev: enter app</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        Explore holidays and talk to Rav without an account. Build a box when you are ready — sign up
        at checkout.
      </Text>
    </AuthHeroShell>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: typography.md,
    ...typeface('light'),
    letterSpacing: -0.22,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  firebase: {
    fontSize: typography.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  btn: {
    alignSelf: 'stretch',
    minWidth: undefined,
  },
  loginBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  loginText: {
    fontSize: typography.lg,
    ...typeface('medium'),
    letterSpacing: -0.26,
  },
  devBtn: { marginTop: spacing.xs, alignItems: 'center' },
  devText: {
    fontSize: typography.sm,
    ...typeface('light'),
  },
  hint: {
    fontSize: typography.sm,
    ...typeface('light'),
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
