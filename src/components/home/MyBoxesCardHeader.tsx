import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  title: string;
  subtitle: string;
};

/** Figma 388:358 / 388:370 — centered title + subtitle on My Boxes carousel cards. */
export function MyBoxesCardHeader({ title, subtitle }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createHeaderStyles(colors), [colors]);

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function createHeaderStyles(colors: SemanticColors) {
  return StyleSheet.create({
    block: {
      alignItems: 'center',
      gap: 2,
      width: '100%',
    },
    title: {
      fontSize: typography.lg,
      fontWeight: '400',
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: typography.sm,
      fontWeight: '200',
      color: colors.textPrimary,
      letterSpacing: -0.22,
      textAlign: 'center',
    },
  });
}
