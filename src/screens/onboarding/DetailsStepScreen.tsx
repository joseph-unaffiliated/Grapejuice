import React, { useState } from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';
import { View, Text, StyleSheet, TextInput, Platform, ScrollView } from 'react-native';
import { MobileButton } from '../../components/mobile/MobileButton';
import { balanceProps, m, mFont, mGutter, mType } from '../../components/mobile/mobileTheme';
import type { FamiliarityLevel } from '../../types/pilot';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { FamiliaritySliderControl } from '../../components/onboarding/FamiliaritySliderControl';
import { semanticColors, spacing, typography, borderRadius, typeface, INK } from '../../constants/theme';
import { familiarityScoreToLevel } from '../../stores/guestSessionStore';

const INPUT_MIN_HEIGHT = 120;
/** Cap so the field grows with text but the caret stays on-screen above the CTA. */
const INPUT_MAX_HEIGHT = 280;
const INPUT_PAD = spacing.sm * 2;

type Props = {
  initialScore?: number;
  initialFrequency?: number;
  initialNotes?: string;
  isAuthenticated?: boolean;
  buildError?: string | null;
  building?: boolean;
  onContinue: (result: {
    level: FamiliarityLevel;
    score: number;
    frequency: number;
    notes: string;
  }) => void;
};

function SliderQuestion({
  question,
  minLabel,
  maxLabel,
  value,
  onChange,
  unset,
  last = false,
}: {
  question: string;
  minLabel: string;
  maxLabel: string;
  value: number;
  onChange: (value: number) => void;
  unset?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.section, last && styles.sectionLast]}>
      <Text style={[onboardingBodyText.lead, styles.sectionLead]}>{question}</Text>
      <View style={styles.sliderPullUp}>
        <FamiliaritySliderControl value={value} onChange={onChange} accessibilityLabel={question} hideSteps unset={unset} />
      </View>
      <View style={[styles.sliderLabels, styles.sliderLabelsBelow]}>
        <Text style={styles.sliderLabel}>{minLabel}</Text>
        <Text style={[styles.sliderLabel, styles.sliderLabelRight]}>{maxLabel}</Text>
      </View>
    </View>
  );
}

export function DetailsStepScreen({
  initialScore = 50,
  initialFrequency = 50,
  initialNotes = '',
  isAuthenticated = false,
  buildError = null,
  building = false,
  onContinue,
}: Props) {
  const [score, setScore] = useState(initialScore);
  const [frequency, setFrequency] = useState(initialFrequency);
  const mobileLayout = useMobileLayout();
  // Phone: both sliders start unset so nobody leaves them at the default.
  const [touched, setTouched] = useState<{ score: boolean; frequency: boolean }>({ score: initialScore !== 50, frequency: initialFrequency !== 50 });
  const needsSliders = mobileLayout && !(touched.score && touched.frequency);
  const [notes, setNotes] = useState(initialNotes);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const atMax = inputHeight >= INPUT_MAX_HEIGHT;
  const submit = () => onContinue({ level: familiarityScoreToLevel(score), score, frequency, notes: notes.trim() });

  if (mobileLayout) {
    const slider = (question: string, min: string, max: string, value: number, set: (v: number) => void, unset: boolean) => (
      <View style={mStyles.q}>
        <Text style={mStyles.qT}>{question}</Text>
        <FamiliaritySliderControl value={value} onChange={set} accessibilityLabel={question} hideSteps unset={unset} />
        <View style={mStyles.ends}>
          <Text style={mStyles.end}>{min}</Text>
          <Text style={[mStyles.end, { textAlign: 'right' }]}>{max}</Text>
        </View>
      </View>
    );
    return (
      <View style={mStyles.root}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={mStyles.content} keyboardShouldPersistTaps="handled">
          <Text style={[mType.h1, { fontSize: 30 }]} {...balanceProps}>Each box is unique.</Text>
          <Text style={mStyles.sub} {...balanceProps}>Two quick questions so we explain the right amount. There are no wrong answers.</Text>
          {slider('How has Hanukkah looked in recent years?', 'We don’t really do it', 'We do all eight nights', score, (v) => { setScore(v); setTouched((t) => ({ ...t, score: true })); }, !touched.score)}
          {slider('How often do you do Jewish stuff?', 'Almost never', 'Every day', frequency, (v) => { setFrequency(v); setTouched((t) => ({ ...t, frequency: true })); }, !touched.frequency)}
          <Text style={mStyles.notesLead} {...balanceProps}>Worried about a picky eater? Never lit candles before? Tell us, or leave it blank.</Text>
          <TextInput
            style={mStyles.notes}
            placeholder="e.g. My kid is nervous about fire. We are vegetarian."
            placeholderTextColor={m.muted}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Anything we should know"
          />
          {buildError ? <Text style={styles.error}>{buildError}</Text> : null}
        </ScrollView>
        <View style={mStyles.bottom}>
          {needsSliders ? <Text style={mStyles.hint}>Move both sliders to continue</Text> : null}
          <MobileButton label="Build my box" onPress={submit} disabled={building || needsSliders} busy={building} />
        </View>
      </View>
    );
  }

  return (
    <OnboardingScreenLayout
      title="Each box is unique."
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={submit}
      primaryLoading={building}
      primaryDisabled={building}
      primaryStyle={styles.primaryMatchInput}
      asideSide="right"
      inlineFooter
      footerUnderAside
      aside={
        <View>
          <Text style={[onboardingBodyText.lead, styles.notesLead]}>
            Worried about a picky eater? Never lit candles before? Tell us — or skip. We will use this to
            personalize your box{isAuthenticated ? ' (Rav can reference it in chat)' : ''}.
          </Text>
          <TextInput
            style={[styles.input, mobileLayout && { color: m.ink }, { height: inputHeight }, atMax && styles.inputScrollable]}
            placeholder="e.g. My kid is nervous about fire. We are vegetarian."
            placeholderTextColor={semanticColors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            scrollEnabled={atMax}
            onContentSizeChange={(e) => {
              const contentH = e.nativeEvent.contentSize.height;
              setInputHeight(
                Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, contentH + INPUT_PAD))
              );
            }}
          />
          {buildError ? <Text style={styles.error}>{buildError}</Text> : null}
        </View>
      }
    >
      <SliderQuestion
        question="How has Hanukkah looked in recent years?"
        minLabel="We don’t really do it"
        maxLabel="We do all eight nights"
        value={score}
        onChange={(v) => {
          setScore(v);
          setTouched((t) => ({ ...t, score: true }));
        }}
        unset={false}
      />
      <SliderQuestion
        question="How often do you do Jewish stuff?"
        minLabel="Almost never"
        maxLabel="Every day"
        value={frequency}
        onChange={(v) => {
          setFrequency(v);
          setTouched((t) => ({ ...t, frequency: true }));
        }}
        unset={false}
        last
      />
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionLast: {
    marginBottom: 0,
  },
  sectionLead: {
    ...typeface('medium'),
    marginBottom: 0,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  /** Pull up into the slider's tall hit area so labels sit just under the track. */
  sliderPullUp: {
    marginTop: -spacing.md,
  },
  sliderLabelsBelow: {
    marginTop: -(spacing.sm + spacing.md),
  },
  sliderLabel: {
    ...typeface('light'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
    flex: 1,
  },
  sliderLabelRight: { textAlign: 'right' },
  notesLead: { marginBottom: spacing.md, lineHeight: 28 },
  primaryMatchInput: { borderRadius: borderRadius.xl },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    /** Under 16px, iOS Safari zooms the page on focus. */
    fontSize: 16,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    backgroundColor: semanticColors.bgPrimary,
    color: INK,
    ...typeface('light'),
    ...(Platform.OS === 'web' ? ({ resize: 'none' } as object) : null),
  },
  inputScrollable: {
    ...(Platform.OS === 'web' ? ({ overflowY: 'auto' } as object) : null),
  },
  error: {
    marginTop: spacing.sm,
    fontSize: typography.md,
    color: semanticColors.error,
    lineHeight: 18,
    textAlign: 'center',
  },
});

const mStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  content: { paddingHorizontal: mGutter, paddingTop: 28, paddingBottom: 24 },
  sub: { fontSize: 15, lineHeight: 22, color: m.body, marginTop: 12, ...mFont(300) },
  q: { marginTop: 38 },
  qT: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: m.ink, marginBottom: 4, ...mFont(500) },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: -6 },
  end: { flex: 1, fontSize: 13, color: m.muted, ...mFont(400) },
  notesLead: { fontSize: 14, lineHeight: 21, color: m.body, marginTop: 44, ...mFont(300) },
  notes: { marginTop: 10, borderWidth: 1, borderColor: m.gold, borderRadius: 12, height: 110, padding: 12, fontSize: 16, color: m.ink, ...mFont(300), ...(Platform.OS === 'web' ? ({ resize: 'none' } as object) : null) },
  bottom: { paddingHorizontal: mGutter, paddingTop: 10, paddingBottom: 12, backgroundColor: m.white, gap: 8 },
  hint: { fontSize: 12.5, color: m.muted, textAlign: 'center', ...mFont(400) },
});
