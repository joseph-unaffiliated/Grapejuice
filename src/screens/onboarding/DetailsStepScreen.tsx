import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Platform } from 'react-native';
import type { FamiliarityLevel } from '../../types/pilot';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { FamiliaritySliderControl } from '../../components/onboarding/FamiliaritySliderControl';
import { semanticColors, spacing, typography, borderRadius, typeface } from '../../constants/theme';
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
  last = false,
}: {
  question: string;
  minLabel: string;
  maxLabel: string;
  value: number;
  onChange: (value: number) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.section, last && styles.sectionLast]}>
      <Text style={[onboardingBodyText.lead, styles.sectionLead]}>{question}</Text>
      <View style={styles.sliderPullUp}>
        <FamiliaritySliderControl value={value} onChange={onChange} accessibilityLabel={question} hideSteps />
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
  const [notes, setNotes] = useState(initialNotes);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const atMax = inputHeight >= INPUT_MAX_HEIGHT;

  return (
    <OnboardingScreenLayout
      title="Each box is unique."
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={() =>
        onContinue({
          level: familiarityScoreToLevel(score),
          score,
          frequency,
          notes: notes.trim(),
        })
      }
      primaryLoading={building}
      primaryDisabled={building}
      primaryStyle={styles.primaryMatchInput}
      asideSide="right"
      inlineFooter
      footerUnderAside
      centerVertically
      aside={
        <View>
          <Text style={[onboardingBodyText.lead, styles.notesLead]}>
            Worried about a picky eater? Never lit candles before? Tell us — or skip. We will use this to
            personalize your box{isAuthenticated ? ' (Rav can reference it in chat)' : ''}.
          </Text>
          <TextInput
            style={[styles.input, { height: inputHeight }, atMax && styles.inputScrollable]}
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
        onChange={setScore}
      />
      <SliderQuestion
        question="How often do you do Jewish stuff?"
        minLabel="Almost never"
        maxLabel="Every day"
        value={frequency}
        onChange={setFrequency}
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
    fontSize: 15,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    backgroundColor: semanticColors.bgPrimary,
    color: '#000000',
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
