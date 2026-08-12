import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { HanukkahPracticesOverview } from '../../components/holiday/HanukkahPracticesOverview';
import {
  HANUKKAH_PRACTICES_INTRO,
} from '../../constants/hanukkahPractices';
import { spacing, typeface } from '../../constants/theme';

type Props = {
  onContinue: () => void;
};

export function HanukkahIntroScreen({ onContinue }: Props) {
  return (
    <OnboardingScreenLayout
      kicker="How it Works"
      title="Eight nights. Your pace."
      primaryLabel="Continue"
      onPrimary={onContinue}
    >
      <View style={styles.copy}>
        <Text style={[onboardingBodyText.lead, styles.intro]}>
          Hanukkah is a week of light at home — candles, food, games, small rituals. No Hebrew required. No
          prior experience required. Just show up when you can. Grapejuice sends a curated box with what you
          actually need to celebrate — not decorations that sit in a drawer until next year.
        </Text>

        <Text style={[onboardingBodyText.lead, styles.sectionLead]}>{HANUKKAH_PRACTICES_INTRO}</Text>
        <View style={styles.practices}>
          <HanukkahPracticesOverview layout="stack" showIntro={false} />
        </View>
      </View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  copy: { paddingTop: 0, gap: spacing.sm },
  intro: {
    marginBottom: 0,
  },
  sectionLead: {
    ...typeface('medium'),
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  practices: {
    marginBottom: spacing.sm,
  },
});
