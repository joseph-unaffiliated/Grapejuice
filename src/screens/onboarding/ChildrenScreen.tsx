import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import type { AgeGroup } from '../../types/pilot';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

const AGE_GROUPS: AgeGroup[] = ['0-2', '3-5', '6-8', '9-12'];

export type ChildDraft = {
  name: string;
  ageGroup: AgeGroup;
  /** ISO date YYYY-MM-DD (optional — enables Beam age trigger). */
  birthdate?: string;
};

export function ChildrenScreen({
  onContinue,
}: {
  onContinue: (children: ChildDraft[]) => void;
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
    <WebPageContainer authCard style={styles.wrapper}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Who&apos;s celebrating?</Text>
      <Text style={styles.subtitle}>We match books and activities to your kids&apos; ages.</Text>

      <View style={styles.row}>
        <Text style={styles.label}>How many kids?</Text>
        <View style={styles.stepper}>
          <TouchableOpacity onPress={() => syncCount(count - 1)} style={styles.stepBtn}>
            <Text>−</Text>
          </TouchableOpacity>
          <Text style={styles.count}>{count}</Text>
          <TouchableOpacity onPress={() => syncCount(count + 1)} style={styles.stepBtn}>
            <Text>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {kids.map((kid, i) => (
        <View key={i} style={styles.kidCard}>
          <Text style={styles.kidLabel}>Kid {i + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder="Name (optional)"
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

      <TouchableOpacity style={styles.cta} onPress={() => onContinue(kids)}>
        <Text style={styles.ctaText}>Continue</Text>
      </TouchableOpacity>
      </ScrollView>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { fontSize: 24, fontWeight: '700', color: semanticColors.textPrimary },
  subtitle: { fontSize: typography.lg, color: semanticColors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  label: { fontSize: typography.lg, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: semanticColors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: typography.xl, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  kidCard: { backgroundColor: semanticColors.bgElevated, borderRadius: borderRadius.card, padding: spacing.md, marginBottom: spacing.md },
  kidLabel: { fontWeight: '600', marginBottom: spacing.sm },
  input: { borderWidth: 1, borderColor: semanticColors.border, borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: spacing.sm, fontSize: 16 },
  ageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ageChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: borderRadius.chip, backgroundColor: semanticColors.bgPrimary },
  ageChipOn: { backgroundColor: semanticColors.brand },
  ageText: { fontSize: typography.md },
  ageTextOn: { color: semanticColors.textInverse, fontWeight: '600' },
  cta: { backgroundColor: semanticColors.brand, padding: spacing.md, borderRadius: borderRadius.pill, alignItems: 'center', marginTop: spacing.lg },
  ctaText: { fontWeight: '700', color: semanticColors.textInverse },
});
