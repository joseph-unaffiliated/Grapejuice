import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { FamilyMembersForm } from '../../components/family/FamilyMembersForm';
import {
  type ChildDraft,
  defaultFamilyMembers,
  ensureAdultLead,
  familyMembersComplete,
} from '../../components/family/familyDraft';
import { spacing } from '../../constants/theme';

export type {
  ChildDraft,
  FamilyAgeBand,
  FamilyMemberRole,
} from '../../components/family/familyDraft';
export {
  makeAdultDraft,
  makeKidDraft,
  normalizeFamilyDraft,
} from '../../components/family/familyDraft';

type Props = {
  onContinue: (children: ChildDraft[]) => void;
  initialChildren?: ChildDraft[];
  /** Prefill first adult entry when starting fresh. */
  defaultName?: string;
};

export function BoxIntroScreen({ onContinue, initialChildren, defaultName }: Props) {
  const [members, setMembers] = useState<ChildDraft[]>(() => {
    if (initialChildren?.length) {
      return ensureAdultLead(initialChildren, defaultName);
    }
    return defaultFamilyMembers(defaultName);
  });

  const namesComplete = useMemo(() => familyMembersComplete(members), [members]);

  return (
    <OnboardingScreenLayout
      kicker="Your Family"
      title="Built for your family"
      centerHeader={false}
      primaryLabel="Continue"
      onPrimary={() => onContinue(members)}
      primaryDisabled={!namesComplete}
    >
      <View style={styles.copy}>
        <Text style={[onboardingBodyText.lead, styles.intro]}>
          Your box is personalized just for your family, age-appropriate gifts and books for each kid, and
          enough chocolate gelt for everyone.
        </Text>

        <FamilyMembersForm members={members} onChange={setMembers} />
      </View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  copy: { paddingTop: 0, gap: spacing.sm },
  intro: {
    marginBottom: 0,
  },
});
