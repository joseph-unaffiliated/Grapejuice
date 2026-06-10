import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { useThemeMode } from '../../context/ThemeContext';
import { useFirebaseReady } from '../../hooks/useFirebaseReady';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { spacing, borderRadius, typography } from '../../constants/theme';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = StackNavigationProp<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { ready, error, projectId } = useFirebaseReady();
  const startExplore = useGuestSessionStore((s) => s.startExplore);
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);

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
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.brand }]}
        onPress={() => startExplore()}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, { color: colors.textInverse }]}>Explore Grapejuice</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: colors.brand }]}
        onPress={() => startBuildBox()}
        accessibilityRole="button"
      >
        <Text style={[styles.secondaryButtonText, { color: colors.brand }]}>Build your Hanukkah box</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={styles.secondaryBtn}>
        <Text style={[styles.secondaryText, { color: colors.brand }]}>Log in</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        Explore holidays and talk to Rav without an account. Build a box when you are ready — sign up at checkout.
      </Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  firebase: { fontSize: typography.md, marginBottom: spacing.lg },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonText: { fontSize: typography.xl, fontWeight: '600' },
  secondaryButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: { fontSize: typography.lg, fontWeight: '600' },
  secondaryBtn: { marginTop: spacing.md, alignItems: 'center' },
  secondaryText: { fontSize: typography.lg, fontWeight: '600' },
  hint: { fontSize: typography.sm, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});
