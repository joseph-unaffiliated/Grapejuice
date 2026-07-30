import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
  boxLockChipLabel,
  HANUKKAH_BOX_LOCK_YEAR_LABEL,
} from '../../constants/hanukkahBoxLock';
import {
  borderRadius,
  MOBILE_GUTTER,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type StorefrontServiceId = 'new' | 'box' | 'rav' | 'loved' | 'moments';

const SERVICES: { id: StorefrontServiceId; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'box', label: 'Build a Hanukkah box' },
  { id: 'rav', label: 'Ask Rav' },
  { id: 'loved', label: 'Most loved' },
  { id: 'moments', label: 'Shop by moment' },
];

type Props = {
  onPress: (id: StorefrontServiceId) => void;
};

export function StorefrontServicesNav({ onPress }: Props) {
  const lockLabel = useMemo(() => boxLockChipLabel(), []);

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <TouchableOpacity
          style={styles.lockGroup}
          onPress={() => onPress('box')}
          accessibilityRole="button"
          accessibilityLabel={`${HANUKKAH_BOX_LOCK_YEAR_LABEL}, ${lockLabel}`}
        >
          <Text style={styles.lockYear}>{HANUKKAH_BOX_LOCK_YEAR_LABEL}</Text>
          <View style={styles.lockChip}>
            <Text style={styles.lockChipText}>{lockLabel}</Text>
          </View>
        </TouchableOpacity>

        {SERVICES.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={styles.linkHit}
            onPress={() => onPress(s.id)}
            accessibilityRole="button"
            accessibilityLabel={s.label}
          >
            <Text style={styles.link}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border,
    backgroundColor: semanticColors.bgDark,
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: MOBILE_GUTTER,
    paddingVertical: spacing.sm,
  },
  lockGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  lockYear: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    flexShrink: 0,
  },
  lockChip: {
    backgroundColor: semanticColors.accentCream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    flexShrink: 0,
  },
  lockChipText: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
  },
  linkHit: {
    flexShrink: 0,
  },
  link: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
  },
});
