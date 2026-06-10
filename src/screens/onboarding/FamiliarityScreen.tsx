import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { FamiliarityLevel } from '../../types/pilot';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

const OPTIONS: { level: FamiliarityLevel; title: string; sub: string }[] = [
  { level: 'minimal', title: 'We light candles, that\'s about it.', sub: 'Low-key is fine.' },
  { level: 'moderate', title: 'We do a few things but it\'s pretty loose.', sub: 'Some traditions, no stress.' },
  { level: 'all-in', title: 'We go all in.', sub: 'You want the full experience.' },
];

export function FamiliarityScreen({ onContinue }: { onContinue: (level: FamiliarityLevel) => void }) {
  const [selected, setSelected] = useState<FamiliarityLevel | null>(null);

  return (
    <WebPageContainer authCard style={styles.wrapper}>
    <View style={styles.root}>
      <Text style={styles.title}>How does Hanukkah usually go?</Text>
      <Text style={styles.subtitle}>This sets the tone for your guide — not a test.</Text>

      {OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.level}
          style={[styles.card, selected === opt.level && styles.cardOn]}
          onPress={() => setSelected(opt.level)}
          activeOpacity={0.85}
        >
          <Text style={[styles.cardTitle, selected === opt.level && styles.cardTitleOn]}>{opt.title}</Text>
          <Text style={[styles.cardSub, selected === opt.level && styles.cardSubOn]}>{opt.sub}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.cta, !selected && styles.ctaDisabled]}
        disabled={!selected}
        onPress={() => selected && onContinue(selected)}
      >
        <Text style={styles.ctaText}>See your box</Text>
      </TouchableOpacity>
    </View>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  root: { flex: 1, padding: spacing.lg, paddingTop: spacing.xxl, backgroundColor: semanticColors.bgPrimary },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: typography.lg, color: semanticColors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  card: {
    borderWidth: 2,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: semanticColors.bgElevated,
  },
  cardOn: { borderColor: semanticColors.brand, backgroundColor: semanticColors.brandLight },
  cardTitle: { fontSize: typography.xl, fontWeight: '600' },
  cardTitleOn: { color: semanticColors.textPrimary },
  cardSub: { fontSize: typography.md, color: semanticColors.textSecondary, marginTop: 4 },
  cardSubOn: { color: semanticColors.textSecondary },
  cta: { backgroundColor: semanticColors.brand, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.lg },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontWeight: '700', color: semanticColors.textInverse },
});
