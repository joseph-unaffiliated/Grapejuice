import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { AgeGroup } from '../../types/pilot';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';
import type { GiftChildDraft } from './giftGiveTypes';

const AGE_GROUPS: AgeGroup[] = ['0-2', '3-5', '6-8', '9-12'];

type Props = {
  children: GiftChildDraft[];
  onChange: (next: GiftChildDraft[]) => void;
  disabled?: boolean;
};

/** Compact child ages for giver curation — Figma gift giver frame. */
export function GiftGiverChildrenFields({ children, onChange, disabled }: Props) {
  const syncCount = (n: number) => {
    const c = Math.max(1, Math.min(4, n));
    const next = [...children];
    while (next.length < c) next.push({ ageGroup: '6-8' });
    while (next.length > c) next.pop();
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Kids&apos; ages (for curation)</Text>
      <Text style={styles.hint}>We use ages to pick story books and presents in the box you preview.</Text>

      <View style={styles.row}>
        <Text style={styles.label}>How many kids?</Text>
        <View style={styles.stepper}>
          <TouchableOpacity onPress={() => syncCount(children.length - 1)} style={styles.stepBtn} disabled={disabled}>
            <Text>−</Text>
          </TouchableOpacity>
          <Text style={styles.count}>{children.length}</Text>
          <TouchableOpacity onPress={() => syncCount(children.length + 1)} style={styles.stepBtn} disabled={disabled}>
            <Text>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {children.map((kid, i) => (
        <View key={i} style={styles.kidCard}>
          <Text style={styles.kidLabel}>Kid {i + 1}</Text>
          <View style={styles.ageRow}>
            {AGE_GROUPS.map((ag) => (
              <TouchableOpacity
                key={ag}
                style={[styles.ageChip, kid.ageGroup === ag && styles.ageChipOn]}
                onPress={() => {
                  if (disabled) return;
                  const next = [...children];
                  next[i] = { ageGroup: ag };
                  onChange(next);
                }}
                disabled={disabled}
              >
                <Text style={[styles.ageText, kid.ageGroup === ag && styles.ageTextOn]}>{ag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  heading: { fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.xs },
  hint: { fontSize: typography.md, color: semanticColors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  label: { fontSize: typography.md, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: semanticColors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontSize: typography.xl, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  kidCard: {
    backgroundColor: semanticColors.bgElevated,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  kidLabel: { fontWeight: '600', marginBottom: spacing.sm },
  ageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ageChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: borderRadius.chip, backgroundColor: semanticColors.bgPrimary },
  ageChipOn: { backgroundColor: semanticColors.brand },
  ageText: { fontSize: typography.md },
  ageTextOn: { color: semanticColors.textInverse, fontWeight: '600' },
});
