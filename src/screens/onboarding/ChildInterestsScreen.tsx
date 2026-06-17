import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { CHILD_INTEREST_OPTIONS, type ChildInterestId } from '../../constants/childInterests';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';

type Props = {
  initialSelected?: ChildInterestId[];
  onContinue: (selected: ChildInterestId[]) => void;
};

export function ChildInterestsScreen({ initialSelected = [], onContinue }: Props) {
  const [selected, setSelected] = useState<ChildInterestId[]>(initialSelected);

  const toggle = (id: ChildInterestId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <WebPageContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Personalize</Text>
        <Text style={styles.title}>What do your kids enjoy?</Text>
        <Text style={styles.lead}>Pick any that fit — we use this to choose stories, crafts, and treats.</Text>
        <View style={styles.chips}>
          {CHILD_INTEREST_OPTIONS.map(({ id, label }) => {
            const on = selected.includes(id);
            return (
              <TouchableOpacity
                key={id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => toggle(id)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={[styles.button, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
          onPress={() => onContinue(selected)}
        >
          <Text style={styles.buttonText}>{selected.length ? 'Continue' : 'Skip for now'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxxl, paddingBottom: spacing.xxl },
  kicker: { fontSize: typography.sm, color: semanticColors.goldMuted, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '700', color: semanticColors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.md },
  lead: { fontSize: typography.lg, lineHeight: 22, color: semanticColors.textSecondary, marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  chip: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipOn: { borderColor: semanticColors.goldMuted, backgroundColor: semanticColors.accentCream },
  chipText: { fontSize: typography.md, color: semanticColors.textSecondary },
  chipTextOn: { color: semanticColors.textPrimary, fontWeight: '600' },
  button: {
    backgroundColor: semanticColors.brand,
    borderRadius: borderRadius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { fontSize: typography.xl, fontWeight: '600', color: semanticColors.textPrimary },
});
