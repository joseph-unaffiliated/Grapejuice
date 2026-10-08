import React, { useMemo, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { FamilyMembersForm } from '../../components/family/FamilyMembersForm';
import { PracticeRowIcon } from '../../components/holiday/HanukkahPracticesOverview';
import {
  type ChildDraft,
  defaultFamilyMembers,
  ensureAdultLead,
  familyMembersComplete,
} from '../../components/family/familyDraft';
import { semanticColors, spacing, typography, typeface } from '../../constants/theme';

const PRACTICES: { id: string; label: string }[] = [
  { id: 'candles', label: 'Light the Candles and Sing' },
  { id: 'dreidel', label: 'Play Dreidel with Gelt' },
  { id: 'food', label: 'Eat Fried Foods' },
  { id: 'story', label: 'Tell the Story' },
  { id: 'presents', label: 'Give Presents' },
];

type Props = {
  onContinue: (members: ChildDraft[]) => void;
  initialMembers?: ChildDraft[];
  /** Prefill first adult entry when starting fresh. */
  defaultName?: string;
};

export function FamilyStepScreen({ onContinue, initialMembers, defaultName }: Props) {
  const [members, setMembers] = useState<ChildDraft[]>(() =>
    initialMembers?.length
      ? ensureAdultLead(initialMembers, defaultName).map((m) => ({
          ...m,
          interests: m.interests ? [...m.interests] : [],
        }))
      : defaultFamilyMembers(defaultName)
  );
  const namesComplete = useMemo(() => familyMembersComplete(members), [members]);

  return (
    <OnboardingScreenLayout
      title="Eight nights. Your way."
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={() => onContinue(members)}
      primaryDisabled={!namesComplete}
      asideSide="right"
      inlineFooter
      footerUnderAside
      centerVertically
      aside={
        <FamilyMembersForm members={members} onChange={setMembers} dense showInterests />
      }
    >
      <Text style={[onboardingBodyText.lead, styles.intro]}>
        There’s no wrong way to do Hanukkah. Its traditions are there to bring some light to winter and
        spark the big conversations, the ones where you pass down what matters to you. Tell us about your
        family and we’ll send everything you need for all eight nights: a dreidel, book, and gift for each
        kid, plus candles, gelt, latke and sufganiyot mixes, and a guide to walk you through it. Use what
        fits, skip what doesn’t. Permission granted.
      </Text>
      <View style={styles.practices}>
        {PRACTICES.map((p) => (
          <View key={p.id} style={styles.practiceRow}>
            <PracticeRowIcon practiceId={p.id} size={16} />
            <Text style={styles.practiceLabel}>{p.label}</Text>
          </View>
        ))}
      </View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: 0,
    lineHeight: 28,
  },
  practices: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  practiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  practiceLabel: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
    letterSpacing: -0.26,
  },
});
