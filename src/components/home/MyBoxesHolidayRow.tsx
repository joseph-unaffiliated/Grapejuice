import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import type { MyBoxesHoliday } from '../../constants/myBoxesHolidays';
import { semanticColors, spacing, typography, borderRadius, colors } from '../../constants/theme';

const THUMB_SIZE = 64;

type Props = {
  holiday: MyBoxesHoliday;
  onAction: () => void;
  onDismiss: () => void;
};

export function MyBoxesHolidayRow({ holiday, onAction, onDismiss }: Props) {
  const isGetStarted = holiday.action === 'get-started';
  const actionLabel = isGetStarted ? 'get started' : 'pre-register';

  return (
    <View style={styles.row}>
      <Image source={holiday.image} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.copy}>
        <Text style={styles.date}>{holiday.dateLabel}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {holiday.name}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionPill, isGetStarted ? styles.actionPillGetStarted : styles.actionPillPreregister]}
          onPress={onAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} for ${holiday.name}`}
        >
          <Text style={styles.actionPillText}>
            {actionLabel}
            <Text style={styles.actionChevron}> ›</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${holiday.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.dismiss}>dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const thumbImageBase = {
  width: THUMB_SIZE,
  height: THUMB_SIZE,
  borderRadius: borderRadius.xl,
    backgroundColor: semanticColors.bgElevated,
  ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as object) : {}),
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  thumb: thumbImageBase,
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: 2,
  },
  date: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textSecondary,
    letterSpacing: -0.22,
  },
  name: {
    fontSize: typography.lg,
    fontWeight: '600',
    color: semanticColors.textPrimary,
    letterSpacing: -0.26,
  },
  actions: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  actionPill: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.pill,
    minWidth: 96,
    alignItems: 'center',
  },
  actionPillGetStarted: {
    backgroundColor: colors.warm[300],
  },
  actionPillPreregister: {
    backgroundColor: colors.purple[500],
  },
  actionPillText: {
    fontSize: typography.sm,
    fontWeight: '400',
    color: semanticColors.textInverse,
    letterSpacing: -0.22,
  },
  actionChevron: {
    fontWeight: '300',
  },
  dismiss: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: semanticColors.textSecondary,
    letterSpacing: -0.22,
  },
});
