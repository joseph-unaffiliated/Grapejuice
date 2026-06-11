import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { reflectionsService } from '../../services/firestore/reflections';
import { HOLIDAY_ID } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

type Nav = StackNavigationProp<MainStackParamList>;
type Step = 1 | 2 | 3 | 4;

export function ReflectionFlowScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>(1);
  const [nights, setNights] = useState<boolean[]>(Array(8).fill(false));
  const [wins, setWins] = useState('');
  const [hardMoments, setHardMoments] = useState('');
  const [oneWord, setOneWord] = useState('');
  const [nextYear, setNextYear] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleNight = (i: number) => {
    setNights((n) => n.map((v, idx) => (idx === i ? !v : v)));
  };

  const finish = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await reflectionsService.save(user.uid, {
        holidayId: HOLIDAY_ID,
        wins: `${wins}\nNights: ${nights.map((v, i) => (v ? i + 1 : null)).filter(Boolean).join(', ') || 'none'}`,
        hardMoments,
        nextYearShift: nextYear ?? 'maybe',
        favoriteNight: oneWord,
        updatedAt: new Date().toISOString(),
      });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hanukkah debrief</Text>
      {step === 1 ? (
        <>
          <Text style={styles.prompt}>Which nights did you do something?</Text>
          <View style={styles.nightGrid}>
            {nights.map((on, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.nightChip, on && styles.nightChipOn]}
                onPress={() => toggleNight(i)}
              >
                <Text style={[styles.nightChipText, on && styles.nightChipTextOn]}>Night {i + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Text style={styles.prompt}>What hit? What missed?</Text>
          <TextInput style={styles.input} value={wins} onChangeText={setWins} placeholder="What worked" multiline fontSize={16} />
          <TextInput style={styles.input} value={hardMoments} onChangeText={setHardMoments} placeholder="What was hard" multiline fontSize={16} />
        </>
      ) : null}
      {step === 3 ? (
        <>
          <Text style={styles.prompt}>One word for how it felt.</Text>
          <TextInput style={styles.input} value={oneWord} onChangeText={setOneWord} placeholder="Cozy, chaotic, enough…" fontSize={16} />
        </>
      ) : null}
      {step === 4 ? (
        <>
          <Text style={styles.prompt}>Want a box next year?</Text>
          {(['yes', 'maybe', 'no'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.choice, nextYear === v && styles.choiceOn]}
              onPress={() => setNextYear(v)}
            >
              <Text style={styles.choiceText}>{v === 'yes' ? 'Yes' : v === 'maybe' ? 'Maybe' : 'No'}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.thanks}>Thank you — this helps us plan Passover and next Hanukkah.</Text>
        </>
      ) : null}

      <TouchableOpacity
        style={styles.cta}
        onPress={() => (step < 4 ? setStep((s) => (s + 1) as Step) : void finish())}
        disabled={saving}
      >
        <Text style={styles.ctaText}>{step < 4 ? 'Continue' : saving ? 'Saving…' : 'Done'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.skip}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: 120 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.lg },
  prompt: { fontSize: typography.lg, color: semanticColors.textSecondary, marginBottom: spacing.md },
  nightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nightChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.pill, borderWidth: 1, borderColor: semanticColors.border },
  nightChipOn: { backgroundColor: semanticColors.brandLight, borderColor: semanticColors.brand },
  nightChipText: { fontSize: typography.md },
  nightChipTextOn: { fontWeight: '700', color: semanticColors.brand },
  input: {
    borderWidth: 1,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  choice: { padding: spacing.md, borderWidth: 1, borderColor: semanticColors.border, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  choiceOn: { borderColor: semanticColors.brand, backgroundColor: semanticColors.brandLight },
  choiceText: { fontSize: typography.lg, fontWeight: '600', textAlign: 'center' },
  thanks: { fontSize: typography.md, color: semanticColors.textSecondary, marginTop: spacing.md, lineHeight: 20 },
  cta: { backgroundColor: semanticColors.brand, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.xl },
  ctaText: { color: semanticColors.textInverse, fontWeight: '700', fontSize: typography.lg },
  skip: { textAlign: 'center', marginTop: spacing.lg, color: semanticColors.textTertiary },
});
