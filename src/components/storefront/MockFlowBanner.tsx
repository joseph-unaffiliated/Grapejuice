import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { exitVisitorPlaythrough } from '../../services/admin/visitorPlaythrough';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

/**
 * Sticky banner while visitor playthrough is active — Exit signs out the tester
 * and prefills admin email on sign-in.
 */
export function MockFlowBanner() {
  const active = useMockFlowStore((s) => s.active);
  const landingLabel = useMockFlowStore((s) => s.landingLabel);
  const personaLabel = useMockFlowStore((s) => s.personaLabel);
  const [exiting, setExiting] = useState(false);

  if (!active) return null;

  const onExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await exitVisitorPlaythrough();
    } finally {
      setExiting(false);
    }
  };

  return (
    <View style={styles.root} accessibilityRole="summary">
      <Text style={styles.copy} numberOfLines={2}>
        Visitor playthrough: {landingLabel ?? 'Landing'}
        {personaLabel ? ` · ${personaLabel}` : ''}
      </Text>
      <TouchableOpacity
        onPress={() => void onExit()}
        disabled={exiting}
        accessibilityRole="button"
        accessibilityLabel="Exit visitor playthrough"
        accessibilityState={{ disabled: exiting }}
        style={styles.exit}
        hitSlop={8}
      >
        {exiting ? (
          <ActivityIndicator size="small" color={semanticColors.brand} />
        ) : (
          <Text style={styles.exitText}>Exit</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: semanticColors.logoDark,
    zIndex: 2001,
  },
  copy: {
    ...typeface('regular'),
    flex: 1,
    fontSize: typography.sm,
    color: semanticColors.brand,
  },
  exit: {
    minWidth: 44,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
  },
  exitText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.brand,
  },
});
