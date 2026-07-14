import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { HanukkahPracticesOverview } from '../../components/holiday/HanukkahPracticesOverview';
import { spacing } from '../../constants/theme';

type Props = {
  onContinue: () => void;
  onExplore?: () => void;
};

export function HanukkahPracticesScreen({ onContinue, onExplore }: Props) {
  return (
    <OnboardingScreenLayout
      kicker="How Hanukkah works"
      title="Four practices at home"
      primaryLabel="See your box"
      onPrimary={onContinue}
      secondaryLabel={onExplore ? 'Explore without building a box' : undefined}
      onSecondary={onExplore}
    >
      <Text style={onboardingBodyText.lead}>
        You do not need to do everything Jewish families have ever done. These four are the core — and if
        you do them, you have celebrated Hanukkah.
      </Text>
      <View style={styles.practices}>
        <HanukkahPracticesOverview layout="stack" showIntro={false} />
      </View>
      <Text style={[onboardingBodyText.text, styles.footer]}>
        Your curated box includes materials for each practice — matched to your kids and how involved you
        want to be.
      </Text>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  practices: { marginBottom: spacing.sm },
  footer: { marginTop: spacing.sm },
});
