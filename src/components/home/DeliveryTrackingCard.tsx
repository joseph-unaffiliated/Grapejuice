import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import type { DeliveryTimelineStep } from '../../types/pilot';
import { semanticColors, spacing, typography, borderRadius, shadows, shadowsWeb } from '../../constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  steps: DeliveryTimelineStep[];
};

export function DeliveryTrackingCard({ title, subtitle, steps }: Props) {
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

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: semanticColors.bgPrimary,
  },
  title: { fontSize: typography.titleLg, fontWeight: '600', color: semanticColors.textPrimary },
  subtitle: { fontSize: typography.sm, fontWeight: '200', color: semanticColors.goldMuted, marginTop: spacing.xs },
  timeline: { marginTop: spacing.md, gap: 0 },
  stepRow: { flexDirection: 'row', minHeight: 48 },
  stepRail: { width: 20, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: semanticColors.border,
    backgroundColor: semanticColors.bgPrimary,
  },
  dotCompleted: { borderColor: semanticColors.goldMuted, backgroundColor: semanticColors.goldMuted },
  dotActive: { borderColor: semanticColors.brand, backgroundColor: semanticColors.brand },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: semanticColors.border,
    marginVertical: 2,
  },
  lineCompleted: { backgroundColor: semanticColors.goldMuted },
  stepBody: { flex: 1, paddingBottom: spacing.sm, paddingLeft: spacing.sm },
  stepLabel: { fontSize: typography.md, color: semanticColors.textSecondary, fontWeight: '500' },
  stepLabelActive: { color: semanticColors.textPrimary, fontWeight: '600' },
  stepDetail: { fontSize: typography.sm, color: semanticColors.textTertiary, marginTop: 2, lineHeight: 16 },
});
