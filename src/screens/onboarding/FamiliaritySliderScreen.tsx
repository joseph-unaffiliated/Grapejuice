import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { FamiliarityLevel } from '../../types/pilot';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { FamiliaritySliderControl } from '../../components/onboarding/FamiliaritySliderControl';
import { semanticColors, spacing, typography, typeface } from '../../constants/theme';
import { familiarityScoreToLevel } from '../../stores/guestSessionStore';

type Props = {
  initialScore?: number;
  onContinue: (level: FamiliarityLevel, score: number) => void;
};

export function FamiliaritySliderScreen({ initialScore = 50, onContinue }: Props) {
  const [score, setScore] = useState(initialScore);
  const level = familiarityScoreToLevel(score);

  const levelHint =
    level === 'minimal'
      ? 'We will keep it simple — candles, one treat, low pressure.'
      : level === 'moderate'
        ? 'A few traditions, room to breathe.'
        : 'Full eight nights — we will match that energy.';

  return (
    <OnboardingScreenLayout
      kicker="Familiarity"
      title="How does Hanukkah usually go?"
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={() => onContinue(level, score)}
    >
      <Text style={[onboardingBodyText.lead, styles.subtitle]}>
        Slide to where you are — not where you think you should be. This shapes your box and your guide.
      </Text>

      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>Our first Hanukkah</Text>
        <Text style={[styles.sliderLabel, styles.sliderLabelRight]}>We do all eight nights</Text>
      </View>

      <FamiliaritySliderControl value={score} onChange={setScore} />

      <Text style={styles.hint}>{levelHint}</Text>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginBottom: spacing.md },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  sliderLabel: {
    ...typeface('light'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
    flex: 1,
  },
  sliderLabelRight: { textAlign: 'right' },
  hint: {
    ...typeface('light'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
    marginTop: spacing.md,
    lineHeight: 20,
    textAlign: 'center',
  },
});
