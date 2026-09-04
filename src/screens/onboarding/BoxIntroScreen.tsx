import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import type { AgeGroup } from '../../types/pilot';
import { ageGroupForNumericAge } from '../../services/box/boxRules';
import type { ChildInterestId } from '../../constants/childInterests';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import {
  ONBOARDING_KID_AGE_CHOICES,
  KidAgePicker,
  type KidAgeChoice,
} from '../../components/family/KidAgePicker';
import { semanticColors, spacing, typography, borderRadius, typeface } from '../../constants/theme';

export type FamilyMemberRole = 'kid' | 'adult';

/** @deprecated Prefer plannerAge — kept for legacy guest drafts. */
export type FamilyAgeBand = '0-12' | '13-17' | '18+';

const MAX_MEMBERS = 8;

const LEGACY_BAND_AGE: Record<FamilyAgeBand, number> = {
  '0-12': 6,
  '13-17': 15,
  '18+': 18,
};

export type ChildDraft = {
  name: string;
  /** Defaults to kid when missing (legacy guest drafts). */
  role?: FamilyMemberRole;
  /** @deprecated Prefer plannerAge. */
  ageBand?: FamilyAgeBand;
  /** Mapped band for catalog / persistence. */
  ageGroup: AgeGroup;
  /** ISO date YYYY-MM-DD (optional — enables Beam age trigger). */
  birthdate?: string;
  /**
   * Exact age for box planners / Age chips (0–17). Use 18 for 18+.
   * See ChildProfile.plannerAge.
   */
  plannerAge?: number;
  /** Kid interest tags from What We Do. */
  interests?: ChildInterestId[];
  /** Free-text interests from the Other chip. */
  customInterests?: string[];
};

function profileForAge(age: number): { ageGroup: AgeGroup; plannerAge: number } {
  const n = Math.max(0, Math.floor(age));
  return {
    ageGroup: ageGroupForNumericAge(Math.min(n, 12)),
    plannerAge: n,
  };
}

export function makeAdultDraft(name = ''): ChildDraft {
  return { name, role: 'adult', ageGroup: '9-12' };
}

export function makeKidDraft(name = '', age = 5): ChildDraft {
  const mapped = profileForAge(age);
  return {
    name,
    role: 'kid',
    ageGroup: mapped.ageGroup,
    plannerAge: mapped.plannerAge,
  };
}

/** Normalize legacy drafts (no role / fine age bands) for the new form. */
export function normalizeFamilyDraft(d: ChildDraft): ChildDraft {
  if (d.role === 'adult') {
    return { ...d, role: 'adult', ageBand: undefined, plannerAge: undefined };
  }
  if (typeof d.plannerAge === 'number' && Number.isFinite(d.plannerAge)) {
    const mapped = profileForAge(d.plannerAge);
    return {
      ...d,
      role: 'kid',
      ageBand: d.ageBand,
      ageGroup: mapped.ageGroup,
      plannerAge: mapped.plannerAge,
    };
  }
  if (d.ageBand && d.ageBand in LEGACY_BAND_AGE) {
    return makeKidDraft(d.name, LEGACY_BAND_AGE[d.ageBand]);
  }
  const kid = makeKidDraft(d.name, 5);
  return {
    ...kid,
    name: d.name,
    birthdate: d.birthdate,
    ageGroup: d.ageGroup || kid.ageGroup,
  };
}

function ensureAdultLead(members: ChildDraft[], defaultName?: string): ChildDraft[] {
  const adultName = defaultName?.trim() || 'Joseph';
  const normalized = members.map(normalizeFamilyDraft);
  if (normalized[0]?.role === 'adult') {
    if (!normalized[0].name.trim()) {
      return [{ ...normalized[0], name: adultName }, ...normalized.slice(1)];
    }
    return normalized;
  }
  return [makeAdultDraft(adultName), ...normalized];
}

function defaultMembers(defaultName?: string): ChildDraft[] {
  const adultName = defaultName?.trim() || 'Joseph';
  return [makeAdultDraft(adultName), makeKidDraft('Sam', 5)];
}

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
    return defaultMembers(defaultName);
  });

  const namesComplete = useMemo(
    () => members.every((m) => m.name.trim().length > 0),
    [members]
  );

  const updateMember = (index: number, patch: Partial<ChildDraft>) => {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const setKidAge = (index: number, choice: KidAgeChoice) => {
    if (choice === '13-17') {
      const mapped = profileForAge(15);
      updateMember(index, {
        ageBand: '13-17',
        ageGroup: mapped.ageGroup,
        plannerAge: mapped.plannerAge,
      });
      return;
    }
    if (choice === '18+') {
      const mapped = profileForAge(18);
      updateMember(index, {
        ageBand: '18+',
        ageGroup: mapped.ageGroup,
        plannerAge: mapped.plannerAge,
      });
      return;
    }
    const mapped = profileForAge(choice);
    updateMember(index, {
      ageBand: undefined,
      ageGroup: mapped.ageGroup,
      plannerAge: mapped.plannerAge,
    });
  };

  const addMember = (role: FamilyMemberRole) => {
    if (members.length >= MAX_MEMBERS) return;
    setMembers((prev) => [...prev, role === 'adult' ? makeAdultDraft() : makeKidDraft()]);
  };

  const removeMember = (index: number) => {
    if (index <= 0 || members.length <= 1) return;
    setMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const kidAgeSelected = (member: ChildDraft, choice: KidAgeChoice) => {
    const age = member.plannerAge;
    if (choice === '13-17') {
      return member.ageBand === '13-17' || (typeof age === 'number' && age >= 13 && age <= 17);
    }
    if (choice === '18+') {
      return member.ageBand === '18+' || (typeof age === 'number' && age >= 18);
    }
    if (typeof age !== 'number') return false;
    if (age >= 13) return false;
    return age === choice;
  };

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

        <Text style={[onboardingBodyText.lead, styles.sectionLead]}>
          Tell us who we&apos;re personalizing this for:
        </Text>

        <View style={styles.form}>
          <View style={styles.divider} />
          {members.map((member, i) => (
            <View key={i} style={styles.memberBlock}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.memberCard}>
                <View style={styles.nameInline}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Name"
                    placeholderTextColor={semanticColors.textTertiary}
                    value={member.name}
                    onChangeText={(t) => updateMember(i, { name: t })}
                  />
                  {i > 0 ? (
                    <TouchableOpacity onPress={() => removeMember(i)} hitSlop={8}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.ageInline}>
                  <Text style={styles.fieldLabel}>Age</Text>
                  {member.role === 'adult' ? (
                    <View style={[styles.ageChip, styles.adultChip, styles.ageChipOn]}>
                      <Text style={[styles.ageText, styles.ageTextOn]}>Adult</Text>
                    </View>
                  ) : (
                    <KidAgePicker
                      choices={ONBOARDING_KID_AGE_CHOICES}
                      isSelected={(choice) => kidAgeSelected(member, choice)}
                      onSelect={(choice) => setKidAge(i, choice)}
                    />
                  )}
                </View>
              </View>
            </View>
          ))}

          {members.length < MAX_MEMBERS ? (
            <>
              <View style={styles.divider} />
              <View style={styles.addRow}>
                <TouchableOpacity style={styles.addBtn} onPress={() => addMember('kid')}>
                  <Text style={styles.addBtnText}>Add a kid</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={() => addMember('adult')}>
                  <Text style={styles.addBtnText}>Add an adult</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
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
  form: {
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  memberBlock: {
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.lg,
  },
  divider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.border,
  },
  memberCard: {
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.sm,
  },
  nameInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'nowrap',
  },
  fieldLabel: {
    ...typeface('light'),
    fontSize: typography.titleLg,
    color: '#000000',
    letterSpacing: -0.26,
    lineHeight: 22,
    flexShrink: 0,
    width: 48,
  },
  removeText: {
    ...typeface('light'),
    fontSize: typography.lg,
    color: semanticColors.textTertiary,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    fontSize: typography.titleLg,
    color: '#000000',
  },
  ageInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'nowrap',
  },
  ageChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    backgroundColor: semanticColors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adultChip: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  ageChipOn: { backgroundColor: '#000000' },
  ageText: {
    ...typeface('light'),
    fontSize: typography.md,
    color: '#000000',
  },
  ageTextOn: {
    ...typeface('regular'),
    color: semanticColors.brand,
  },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: '#000000',
    letterSpacing: -0.26,
  },
});
