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

export function BoxIntroScreen({ onContinue, onExplore }: Props) {
  return (
    <OnboardingScreenLayout
      title="Built for your family"
      primaryLabel="Set up my family"
      onPrimary={onContinue}
      secondaryLabel={onExplore ? 'Explore without building a box' : undefined}
      onSecondary={onExplore}
    >
      <View style={styles.copy}>
        <Text style={onboardingBodyText.lead}>
          We curate candles, gelt, a treat path (latkes or sufganiyot), a printed guide for each night, and
          a story or activity for every kid — sized to their age.
        </Text>
        <Text style={onboardingBodyText.lead}>
          Most of it is included. Swap kid picks if something does not fit. Add extras only if you want them.
        </Text>
        <Text style={onboardingBodyText.text}>Tell us about your kids next — we will build yours.</Text>
      </View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  copy: { paddingTop: spacing.sm, gap: spacing.sm },
});
