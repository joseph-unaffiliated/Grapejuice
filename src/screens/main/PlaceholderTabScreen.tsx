import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { ScreenShell } from '../../components/ui/ScreenShell';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography } from '../../constants/theme';

export function PlaceholderTabScreen({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle: string;
  phase: string;
}) {
  const { colors } = useThemeMode();

  return (
    <ScreenShell title={title} subtitle={subtitle} showByline>
      <Text style={[styles.phase, { color: colors.textTertiary }]}>Build phase: {phase}</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  phase: { fontSize: typography.md, marginTop: spacing.lg },
});
