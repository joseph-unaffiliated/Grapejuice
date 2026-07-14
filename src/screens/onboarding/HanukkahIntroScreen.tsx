import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { spacing } from '../../constants/theme';

type Props = {
  onContinue: () => void;
  onExplore?: () => void;
};

export function HanukkahIntroScreen({ onContinue, onExplore }: Props) {
  return (
    <OnboardingScreenLayout
      kicker="Hanukkah 2026"
      title="Eight nights. Your pace."
      primaryLabel="Continue"
      onPrimary={onContinue}
      secondaryLabel={onExplore ? 'Explore without building a box' : undefined}
      onSecondary={onExplore}
    >
      <View style={styles.copy}>
        <Text style={onboardingBodyText.lead}>
          Hanukkah is a week of light at home — candles, food, games, small rituals. No Hebrew required.
          No prior experience required. Just show up when you can.
        </Text>
        <Text style={onboardingBodyText.text}>
          Grapejuice sends a curated box with what you actually need to celebrate — not decorations that
          sit in a drawer until next year.
        </Text>
      </View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  copy: { paddingTop: spacing.sm, gap: spacing.sm },
});
