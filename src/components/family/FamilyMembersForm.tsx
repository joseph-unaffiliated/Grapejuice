import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import type { ChildDraft, FamilyMemberRole } from './familyDraft';
import { makeAdultDraft, makeKidDraft } from './familyDraft';
import {
  ONBOARDING_KID_AGE_CHOICES,
  KidAgePicker,
  type KidAgeChoice,
} from './KidAgePicker';
import { semanticColors, spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { ageGroupForNumericAge } from '../../services/box/boxRules';
import type { AgeGroup } from '../../types/pilot';

const MAX_MEMBERS = 8;

function profileForAge(age: number): { ageGroup: AgeGroup; plannerAge: number } {
  const n = Math.max(0, Math.floor(age));
  return {
    ageGroup: ageGroupForNumericAge(Math.min(n, 12)),
    plannerAge: n,
  };
}

type Props = {
  members: ChildDraft[];
  onChange: (next: ChildDraft[]) => void;
  /** Optional lead-in copy above the name/age rows. */
  sectionLead?: string;
};

export function FamilyMembersForm({
  members,
  onChange,
  sectionLead = 'Tell us who we\u2019re personalizing this for:',
}: Props) {
  const updateMember = (index: number, patch: Partial<ChildDraft>) => {
    const next = [...members];
    next[index] = { ...next[index], ...patch };
    onChange(next);
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
    onChange([...members, role === 'adult' ? makeAdultDraft() : makeKidDraft()]);
  };

  const removeMember = (index: number) => {
    if (index <= 0 || members.length <= 1) return;
    onChange(members.filter((_, i) => i !== index));
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
    <View style={styles.copy}>
      {sectionLead ? <Text style={styles.sectionLead}>{sectionLead}</Text> : null}

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
  );
}

const styles = StyleSheet.create({
  copy: { paddingTop: 0, gap: spacing.sm },
  sectionLead: {
    ...typeface('medium'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
    letterSpacing: -0.26,
    lineHeight: 22,
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
    color: semanticColors.logoDark,
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
    ...typeface('regular'),
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    fontSize: Platform.OS === 'web' ? 14 : 16,
    color: '#000000',
  },
  ageInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'nowrap',
  },
  ageChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.xl,
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
    fontSize: typography.xs,
    color: '#000000',
  },
  ageTextOn: {
    ...typeface('light'),
    color: '#FFFFFF',
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
    backgroundColor: semanticColors.brand,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.logoDark,
    letterSpacing: -0.26,
  },
});
