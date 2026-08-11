import React, { useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import { spacing, typography, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';

const HOLD_SECONDS = 9 * 60 + 59;

function formatHold(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Inline guest hold copy for the My Box order-summary card.
 * CTAs live on the summary row (Sign up / Sign in) — this is messaging only.
 */
export function GuestBoxAuthBanner() {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [remaining, setRemaining] = useState(HOLD_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((v) => (v <= 0 ? HOLD_SECONDS : v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Text style={styles.copy} accessibilityRole="summary">
      {`Items held for ${formatHold(remaining)}. Sign up to save.`}
    </Text>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    copy: {
      fontSize: typography.sm,
      lineHeight: 18,
      ...typeface('light'),
      color: colors.textSecondary,
      flexShrink: 1,
      // Breath after Total / price before hold messaging.
      paddingLeft: spacing.sm,
    },
  });
}
