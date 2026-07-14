import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import type { AgeGroup } from '../../types/pilot';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { semanticColors, spacing, typography, borderRadius, typeface } from '../../constants/theme';

const AGE_GROUPS: AgeGroup[] = ['0-2', '3-5', '6-8', '9-12'];

export type ChildDraft = {
  name: string;
  ageGroup: AgeGroup;
  /** ISO date YYYY-MM-DD (optional — enables Beam age trigger). */
  birthdate?: string;
};

export function ChildrenScreen({
  onContinue,
  onExplore,
}: {
  onContinue: (children: ChildDraft[]) => void;
  onExplore?: () => void;
}) {
  const [count, setCount] = useState(1);
  const [kids, setKids] = useState<ChildDraft[]>([{ name: '', ageGroup: '3-5' }]);

  const syncCount = (n: number) => {
    const c = Math.max(0, Math.min(4, n));
    setCount(c);
    setKids((prev) => {
      const next = [...prev];
      while (next.length < c) next.push({ name: '', ageGroup: '3-5' });
      while (next.length > c) next.pop();
      return next;
    });
  };

  return (
    <OnboardingScreenLayout
      title="Who's celebrating?"
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={() => onContinue(kids)}
      secondaryLabel={onExplore ? 'Explore without building a box' : undefined}
      onSecondary={onExplore}
    >
      <Text style={[onboardingBodyText.lead, styles.subtitle]}>
        We match books and activities to your kids&apos; ages.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>How many kids?</Text>
        <View style={styles.stepper}>
          <TouchableOpacity onPress={() => syncCount(count - 1)} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.count}>{count}</Text>
          <TouchableOpacity onPress={() => syncCount(count + 1)} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {kids.map((kid, i) => (
        <View key={i} style={styles.kidCard}>
          <Text style={styles.kidLabel}>Kid {i + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder="Name (optional)"
            placeholderTextColor={semanticColors.textTertiary}
            value={kid.name}
            onChangeText={(t) => {
              const next = [...kids];
              next[i] = { ...next[i], name: t };
              setKids(next);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Birthdate (YYYY-MM-DD, optional)"
            placeholderTextColor={semanticColors.textTertiary}
            value={kid.birthdate ?? ''}
            onChangeText={(t) => {
              const next = [...kids];
              next[i] = { ...next[i], birthdate: t.trim() || undefined };
              setKids(next);
            }}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.ageRow}>
            {AGE_GROUPS.map((ag) => (
              <TouchableOpacity
                key={ag}
                style={[styles.ageChip, kid.ageGroup === ag && styles.ageChipOn]}
                onPress={() => {
                  const next = [...kids];
                  next[i] = { ...next[i], ageGroup: ag };
                  setKids(next);
                }}
              >
                <Text style={[styles.ageText, kid.ageGroup === ag && styles.ageTextOn]}>{ag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  label: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: '#000000',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 18, color: '#000000' },
  count: {
    ...typeface('regular'),
    fontSize: typography.xxl,
    minWidth: 24,
    textAlign: 'center',
    color: '#000000',
  },
  kidCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: semanticColors.bgPrimary,
  },
  kidLabel: {
    ...typeface('regular'),
    fontSize: typography.md,
    color: '#000000',
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 15,
    color: '#000000',
  },
  ageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ageChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
  },
  ageChipOn: { backgroundColor: '#000000' },
  ageText: {
    ...typeface('light'),
    fontSize: typography.md,
    color: '#000000',
  },
  ageTextOn: {
    ...typeface('regular'),
    color: semanticColors.brand,
  },
});
