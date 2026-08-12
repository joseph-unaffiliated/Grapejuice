import React, { useState } from 'react';
import { Text, StyleSheet, TextInput, Platform } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { semanticColors, spacing, borderRadius, typography, typeface } from '../../constants/theme';

const INPUT_MIN_HEIGHT = 120;
/** Cap so the field grows with text but the caret stays on-screen above the CTA. */
const INPUT_MAX_HEIGHT = 280;
const INPUT_PAD = spacing.sm * 2;

type Props = {
  initialNotes?: string;
  isAuthenticated?: boolean;
  buildError?: string | null;
  building?: boolean;
  onContinue: (notes: string) => void;
};

export function RavOpenQuestionScreen({
  initialNotes = '',
  isAuthenticated = false,
  buildError = null,
  building = false,
  onContinue,
}: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const atMax = inputHeight >= INPUT_MAX_HEIGHT;

  return (
    <OnboardingScreenLayout
      kicker="Notes"
      title="Anything else we should know?"
      centerHeader={false}
      primaryLabel={building ? 'Building your box…' : 'Show me my box!'}
      onPrimary={() => onContinue(notes.trim())}
      primaryLoading={building}
      primaryDisabled={building}
    >
      <Text style={[onboardingBodyText.lead, styles.subtitle]}>
        Worried about a picky eater? Never lit candles before? Tell us — or skip. We will use this to
        personalize your guide{isAuthenticated ? ' (Rav can reference it in chat)' : ''}.
      </Text>

      <TextInput
        style={[
          styles.input,
          { height: inputHeight },
          atMax && styles.inputScrollable,
        ]}
        placeholder="e.g. My kid is nervous about fire. We are vegetarian."
        placeholderTextColor={semanticColors.textTertiary}
        value={notes}
        onChangeText={setNotes}
        multiline
        textAlignVertical="top"
        scrollEnabled={atMax}
        onContentSizeChange={(e) => {
          const contentH = e.nativeEvent.contentSize.height;
          const next = Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, contentH + INPUT_PAD));
          setInputHeight(next);
        }}
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
