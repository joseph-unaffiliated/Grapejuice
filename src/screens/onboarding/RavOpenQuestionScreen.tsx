import React, { useState } from 'react';
import { Text, StyleSheet, TextInput } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { semanticColors, spacing, borderRadius, typography, typeface } from '../../constants/theme';

type Props = {
  initialNotes?: string;
  isAuthenticated?: boolean;
  buildError?: string | null;
  building?: boolean;
  onContinue: (notes: string) => void;
  onExplore?: () => void;
};

export function RavOpenQuestionScreen({
  initialNotes = '',
  isAuthenticated = false,
  buildError = null,
  building = false,
  onContinue,
  onExplore,
}: Props) {
  const [notes, setNotes] = useState(initialNotes);

  return (
    <OnboardingScreenLayout
      kicker="Before we build your box"
      title="Anything Rav should know?"
      centerHeader={false}
      primaryLabel={
        building ? 'Building your box…' : notes.trim() ? 'Build my box' : 'Skip — build my box'
      }
      onPrimary={() => onContinue(notes.trim())}
      primaryLoading={building}
      primaryDisabled={building}
      secondaryLabel={onExplore ? 'Explore without building a box' : undefined}
      onSecondary={onExplore}
      secondaryDisabled={building}
    >
      <Text style={[onboardingBodyText.lead, styles.subtitle]}>
        Worried about a picky eater? Never lit candles before? Tell us — or skip. We will use this to
        personalize your guide{isAuthenticated ? ' (Rav can reference it in chat)' : ''}.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. My kid is nervous about fire. We are vegetarian."
        placeholderTextColor={semanticColors.textTertiary}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {buildError ? <Text style={styles.error}>{buildError}</Text> : null}
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginBottom: spacing.md },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    fontSize: 15,
    minHeight: 120,
    backgroundColor: semanticColors.bgPrimary,
    color: '#000000',
    ...typeface('light'),
  },
  error: {
    marginTop: spacing.sm,
    fontSize: typography.md,
    color: semanticColors.error,
    lineHeight: 18,
    textAlign: 'center',
  },
});
