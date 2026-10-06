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
      title="Eight nights. Your way."
      primaryLabel="Continue"
      onPrimary={onContinue}
      asideSide="left"
      inlineFooter
      centerVertically
      aside={
        <View style={styles.copy}>
          <View style={styles.practices}>
            <HanukkahPracticesOverview layout="stack" divided showIntro={false} />
          </View>
          <Text style={[onboardingBodyText.lead, styles.sectionLead]}>{HANUKKAH_PRACTICES_INTRO}</Text>
        </View>
      }
    >
      <Text style={[onboardingBodyText.lead, styles.intro]}>
        There’s no wrong way to do Hanukkah. Its traditions are there to bring some light to winter and
        spark the big conversations, the ones where you pass down what matters to you. Tell us about your
        family and we’ll send everything you need for all eight nights: a dreidel, book, and gift for each
        kid, plus candles, gelt, latke and sufganiyot mixes, and a guide to walk you through it. Use what
        fits, skip what doesn’t. Permission granted.
      </Text>
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
    marginBottom: 0,
  },
  practices: {
    marginBottom: 0,
  },
});
