import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import type { FamiliarityLevel } from '../../types/pilot';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { FamiliaritySliderControl } from '../../components/onboarding/FamiliaritySliderControl';
import { CHILD_INTEREST_OPTIONS, type ChildInterestId } from '../../constants/childInterests';
import { semanticColors, spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { familiarityScoreToLevel } from '../../stores/guestSessionStore';
import type { ChildDraft } from './BoxIntroScreen';

type Props = {
  family: ChildDraft[];
  initialScore?: number;
  onContinue: (result: {
    level: FamiliarityLevel;
    score: number;
    children: ChildDraft[];
    interests: string[];
  }) => void;
};

function flattenKidInterests(members: ChildDraft[]): string[] {
  const set = new Set<string>();
  for (const m of members) {
    if (m.role === 'adult') continue;
    for (const id of m.interests ?? []) set.add(id);
    for (const custom of m.customInterests ?? []) {
      const t = custom.trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

/** Chip with invisible regular-weight sizer so selecting (bolder text) doesn't reflow the wrap. */
function InterestChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View>
        <Text
          style={[styles.chipText, styles.chipTextSizer]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {label}
        </Text>
        <Text style={[styles.chipText, selected && styles.chipTextOn, styles.chipTextOverlay]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function WhatWeDoScreen({ family: initialChildren, initialScore = 50, onContinue }: Props) {
  const [score, setScore] = useState(initialScore);
  const [members, setMembers] = useState<ChildDraft[]>(() =>
    initialChildren.map((c) => ({
      ...c,
      interests: c.interests ? [...c.interests] : [],
      customInterests: c.customInterests ? [...c.customInterests] : [],
    }))
  );
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [otherDraft, setOtherDraft] = useState<Record<number, string>>({});
  const level = familiarityScoreToLevel(score);
  const kids = useMemo(() => members.filter((m) => m.role !== 'adult'), [members]);

  const toggleInterest = (memberIndex: number, id: ChildInterestId) => {
    setMembers((prev) => {
      const next = [...prev];
      const current = next[memberIndex];
      const interests = current.interests ?? [];
      next[memberIndex] = {
        ...current,
        interests: interests.includes(id) ? interests.filter((x) => x !== id) : [...interests, id],
      };
      return next;
    });
  };

  const commitOther = (memberIndex: number) => {
    const raw = (otherDraft[memberIndex] ?? '').trim();
    if (!raw) {
      setOtherOpen((prev) => ({ ...prev, [memberIndex]: false }));
      return;
    }
    setMembers((prev) => {
      const next = [...prev];
      const current = next[memberIndex];
      const customs = current.customInterests ?? [];
      if (customs.some((c) => c.toLowerCase() === raw.toLowerCase())) {
        return prev;
      }
      next[memberIndex] = { ...current, customInterests: [...customs, raw] };
      return next;
    });
    setOtherDraft((prev) => ({ ...prev, [memberIndex]: '' }));
    setOtherOpen((prev) => ({ ...prev, [memberIndex]: false }));
  };

  const removeCustom = (memberIndex: number, value: string) => {
    setMembers((prev) => {
      const next = [...prev];
      const current = next[memberIndex];
      next[memberIndex] = {
        ...current,
        customInterests: (current.customInterests ?? []).filter((c) => c !== value),
      };
      return next;
    });
  };

  return (
    <OnboardingScreenLayout
      kicker="What We Do"
      title="Tell us a bit about you"
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={() =>
        onContinue({
          level,
          score,
          children: members,
          interests: flattenKidInterests(members),
        })
      }
    >
      <View style={styles.section}>
        <Text style={[onboardingBodyText.lead, styles.sectionLead]}>How has Hanukkah gone in past years?</Text>
        <Text style={onboardingBodyText.text}>
          Slide to where you are — not where you think you should be. This shapes your box and your guide.
        </Text>

        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Our first Hanukkah</Text>
          <Text style={[styles.sliderLabel, styles.sliderLabelRight]}>We do all eight nights</Text>
        </View>

        <FamiliaritySliderControl value={score} onChange={setScore} />
      </View>

      {kids.length > 0 ? (
        <View style={styles.section}>
          <Text style={[onboardingBodyText.lead, styles.sectionLead]}>What do your kids enjoy?</Text>
          <Text style={[onboardingBodyText.text, styles.interestsIntro]}>
            Pick any that fit — we use this to choose stories, crafts, and treats.
          </Text>

          {members.map((member, index) => {
            if (member.role === 'adult') return null;
            const kidOrdinal = members.slice(0, index + 1).filter((m) => m.role !== 'adult').length;
            const kidLabel = member.name.trim() || `Kid ${kidOrdinal}`;
            const selected = member.interests ?? [];
            const customs = member.customInterests ?? [];
            const showOther = !!otherOpen[index];
            return (
              <View key={index} style={styles.kidBlock}>
                <Text style={styles.kidName}>{kidLabel}</Text>
                <View style={styles.chips}>
                  {CHILD_INTEREST_OPTIONS.map(({ id, label }) => (
                    <InterestChip
                      key={id}
                      label={label}
                      selected={selected.includes(id)}
                      onPress={() => toggleInterest(index, id)}
                    />
                  ))}
                  {customs.map((custom) => (
                    <InterestChip
                      key={custom}
                      label={custom}
                      selected
                      onPress={() => removeCustom(index, custom)}
                    />
                  ))}
                  <InterestChip
                    label="Other"
                    selected={showOther}
                    onPress={() => setOtherOpen((prev) => ({ ...prev, [index]: !prev[index] }))}
                  />
                </View>
                {showOther ? (
                  <TextInput
                    style={styles.otherInput}
                    placeholder="Type an interest"
                    placeholderTextColor={semanticColors.textTertiary}
                    value={otherDraft[index] ?? ''}
                    onChangeText={(t) => setOtherDraft((prev) => ({ ...prev, [index]: t }))}
                    onSubmitEditing={() => commitOther(index)}
                    onBlur={() => commitOther(index)}
                    autoFocus
                    returnKeyType="done"
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </OnboardingScreenLayout>
  );
}

const CHIP_GAP = 8;

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionLead: {
    ...typeface('medium'),
    marginBottom: 0,
  },
  interestsIntro: {
    marginBottom: spacing.sm,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: {
    ...typeface('light'),
    fontSize: typography.md,
    color: semanticColors.goldMuted,
    flex: 1,
  },
  sliderLabelRight: { textAlign: 'right' },
  kidBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kidName: {
    ...typeface('regular'),
    fontSize: typography.titleLg,
    color: '#000000',
    letterSpacing: -0.26,
    lineHeight: 22,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CHIP_GAP,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: '#000000',
  },
  chipText: {
    ...typeface('light'),
    fontSize: typography.xl,
    color: '#000000',
  },
  chipTextOn: {
    ...typeface('regular'),
    color: semanticColors.brand,
  },
  chipTextSizer: {
    ...typeface('regular'),
    opacity: 0,
  },
  chipTextOverlay: {
    ...StyleSheet.absoluteFillObject,
    textAlign: 'center',
  },
  otherInput: {
    alignSelf: 'stretch',
    minHeight: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    fontSize: typography.titleLg,
    color: '#000000',
  },
});
