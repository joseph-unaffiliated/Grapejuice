import React from 'react';
import { Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { useThemeMode } from '../../context/ThemeContext';
import { useFirebaseReady } from '../../hooks/useFirebaseReady';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { GrapejuiceButton } from '../../components/ui/GrapejuiceButton';
import { spacing, typography } from '../../constants/theme';
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
    <ScreenShell
      title="Grapejuice"
      subtitle="A Hanukkah box for families who want to celebrate — and need help knowing how."
      showByline
      variant="auth-card"
    >
      <Text style={[styles.firebase, { color: ready ? colors.success : colors.warning }]}>
        Firebase {projectId ? `(${projectId})` : ''}: {ready ? 'connected' : error ? 'setup needed' : 'checking…'}
      </Text>
      <GrapejuiceButton
        label="Explore Grapejuice"
        variant="filled"
        onPress={() => startExplore()}
        style={styles.fullWidth}
      />
      <GrapejuiceButton
        label="Build your Hanukkah box"
        variant="pillOutline"
        onPress={() => startBuildBox()}
        style={[styles.fullWidth, styles.gapTop]}
      />
      <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={styles.secondaryBtn}>
        <Text style={[styles.secondaryText, { color: colors.brand }]}>Log in</Text>
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
          style={[styles.fullWidth, styles.gapTop]}
        />
      ) : null}
      {__DEV__ ? (
        <TouchableOpacity onPress={() => startExplore()} style={styles.devBtn}>
          <Text style={[styles.devText, { color: colors.textTertiary }]}>Dev: enter app</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        Explore holidays and talk to Rav without an account. Build a box when you are ready — sign up at checkout.
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  firebase: { fontSize: typography.md, marginBottom: spacing.lg },
  fullWidth: { alignSelf: 'stretch', minWidth: undefined },
  gapTop: { marginTop: spacing.md },
  secondaryBtn: { marginTop: spacing.md, alignItems: 'center' },
  secondaryText: { fontSize: typography.lg, fontWeight: '600' },
  devBtn: { marginTop: spacing.sm, alignItems: 'center' },
  devText: { fontSize: typography.sm, fontWeight: '400' },
  hint: { fontSize: typography.sm, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});
