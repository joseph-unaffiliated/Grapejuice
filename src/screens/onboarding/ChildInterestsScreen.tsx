import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { CHILD_INTEREST_OPTIONS, type ChildInterestId } from '../../constants/childInterests';
import { semanticColors, spacing, typography, borderRadius, typeface } from '../../constants/theme';

type Props = {
  initialSelected?: ChildInterestId[];
  onContinue: (selected: ChildInterestId[]) => void;
  onExplore?: () => void;
};

export function ChildInterestsScreen({ initialSelected = [], onContinue, onExplore }: Props) {
  const [selected, setSelected] = useState<ChildInterestId[]>(initialSelected);

  const toggle = (id: ChildInterestId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <OnboardingScreenLayout
      kicker="Personalize"
      title="What do your kids enjoy?"
      primaryLabel={selected.length ? 'Continue' : 'Skip for now'}
      onPrimary={() => onContinue(selected)}
      secondaryLabel={onExplore ? 'Explore without building a box' : undefined}
      onSecondary={onExplore}
    >
      <Text style={onboardingBodyText.lead}>
        Pick any that fit — we use this to choose stories, crafts, and treats.
      </Text>
      <View style={styles.chips}>
        {CHILD_INTEREST_OPTIONS.map(({ id, label }) => {
          const on = selected.includes(id);
          return (
            <TouchableOpacity
              key={id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggle(id)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipOn: {
    backgroundColor: '#000000',
  },
  chipText: {
    ...typeface('light'),
    fontSize: typography.md,
    color: '#000000',
  },
  chipTextOn: {
    ...typeface('regular'),
    color: semanticColors.brand,
  },
});
