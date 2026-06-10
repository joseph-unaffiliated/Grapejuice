import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import type { DeliveryTimelineStep } from '../../types/pilot';
import { spacing, typography, shadows, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  title: string;
  subtitle?: string;
  steps: DeliveryTimelineStep[];
};

export function DeliveryTrackingCard({ title, subtitle, steps }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createDeliveryStyles(colors), [colors]);
  const cardStyle = [
    styles.card,
    Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow,
  ];

  return (
    <View style={cardStyle}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.timeline}>
        {steps.map((step, index) => (
          <View key={step.id} style={styles.stepRow}>
            <View style={styles.stepRail}>
              <View
                style={[
                  styles.dot,
                  step.completed && styles.dotCompleted,
                  step.active && styles.dotActive,
                ]}
              />
              {index < steps.length - 1 ? (
                <View style={[styles.line, step.completed && styles.lineCompleted]} />
              ) : null}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepLabel, step.active && styles.stepLabelActive]}>{step.label}</Text>
              {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function createDeliveryStyles(colors: SemanticColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      borderRadius: 16,
      backgroundColor: colors.bgPrimary,
    },
    title: { fontSize: typography.titleLg, fontWeight: '600', color: colors.textPrimary },
    subtitle: { fontSize: typography.sm, fontWeight: '200', color: colors.goldMuted, marginTop: spacing.xs },
    timeline: { marginTop: spacing.md, gap: 0 },
    stepRow: { flexDirection: 'row', minHeight: 48 },
    stepRail: { width: 20, alignItems: 'center' },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: colors.goldMuted,
      backgroundColor: colors.bgPrimary,
    },
    dotCompleted: { backgroundColor: colors.brand, borderColor: colors.brand },
    dotActive: { borderColor: colors.brand, backgroundColor: colors.bgPrimary },
    line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
    lineCompleted: { backgroundColor: colors.brand },
    stepBody: { flex: 1, paddingLeft: spacing.sm, paddingBottom: spacing.sm },
    stepLabel: { fontSize: typography.lg, color: colors.goldMuted, fontWeight: '400' },
    stepLabelActive: { color: colors.textPrimary, fontWeight: '600' },
    stepDetail: { fontSize: typography.sm, color: colors.textSecondary, marginTop: 2 },
  });
}
