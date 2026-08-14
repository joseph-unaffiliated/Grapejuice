import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

/**
 * Sticky banner while admin mock-flow is active — Exit restores prior chrome.
 */
export function MockFlowBanner() {
  const active = useMockFlowStore((s) => s.active);
  const landingLabel = useMockFlowStore((s) => s.landingLabel);
  const personaLabel = useMockFlowStore((s) => s.personaLabel);
  const exit = useMockFlowStore((s) => s.exit);

  if (!active) return null;

  const onExit = () => {
    exit();
    navigateMainStack('StorefrontHome');
  };

  return (
    <View style={styles.root} accessibilityRole="summary">
      <Text style={styles.copy} numberOfLines={2}>
        Mock flow: {landingLabel ?? 'Landing'}
        {personaLabel ? ` · ${personaLabel}` : ''}
      </Text>
      <TouchableOpacity
        onPress={onExit}
        accessibilityRole="button"
        accessibilityLabel="Exit mock flow"
        style={styles.exit}
        hitSlop={8}
      >
        <Text style={styles.exitText}>Exit</Text>
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
  },
  copy: {
    ...typeface('regular'),
    flex: 1,
    fontSize: typography.sm,
    color: semanticColors.brand,
  },
  exit: {
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
