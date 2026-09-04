import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, typeface, semanticColors } from '../../constants/theme';
import type { GiftChildDraft } from './giftGiveTypes';
import { giftChildFromAge } from './giftGiveTypes';
import {
  GIFT_KID_AGE_CHOICES,
  KidAgePicker,
  type KidAgeChoice,
} from '../../components/family/KidAgePicker';

const MAX_KIDS = 4;

type Props = {
  children: GiftChildDraft[];
  onChange: (next: GiftChildDraft[]) => void;
  disabled?: boolean;
};

/** Kid ages for giver curation — visual match to onboarding BoxIntro age chips. */
export function GiftGiverChildrenFields({ children, onChange, disabled }: Props) {
  const styles = useMemo(() => createStyles(), []);

  const syncCount = (n: number) => {
    const c = Math.max(1, Math.min(MAX_KIDS, n));
    const next = [...children];
    while (next.length < c) next.push(giftChildFromAge(6));
    while (next.length > c) next.pop();
    onChange(next);
  };

  const setKidAge = (index: number, choice: KidAgeChoice) => {
    if (disabled) return;
    const next = [...children];
    if (choice === '18+') {
      next[index] = giftChildFromAge(18);
    } else if (choice === '13-17') {
      next[index] = giftChildFromAge(15);
    } else {
      next[index] = giftChildFromAge(choice);
    }
    onChange(next);
  };

  const kidAgeSelected = (kid: GiftChildDraft, choice: KidAgeChoice) => {
    const age = kid.plannerAge;
    if (choice === '18+') return age >= 18;
    if (choice === '13-17') return age >= 13 && age <= 17;
    return age === choice;
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Kids&apos; ages (for curation)</Text>
      <Text style={styles.hint}>
        Same ages as box onboarding — we use them for books and presents.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>How many kids?</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => syncCount(children.length - 1)}
            style={styles.stepBtn}
            disabled={disabled || children.length <= 1}
            accessibilityRole="button"
            accessibilityLabel="Fewer kids"
          >
            <Text style={styles.stepBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.count}>{children.length}</Text>
          <TouchableOpacity
            onPress={() => syncCount(children.length + 1)}
            style={styles.stepBtn}
            disabled={disabled || children.length >= MAX_KIDS}
            accessibilityRole="button"
            accessibilityLabel="More kids"
          >
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {children.map((kid, i) => (
        <View key={i} style={styles.kidBlock}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.ageInline}>
            <Text style={styles.fieldLabel}>Kid {i + 1}</Text>
            <KidAgePicker
              choices={GIFT_KID_AGE_CHOICES}
              isSelected={(choice) => kidAgeSelected(kid, choice)}
              onSelect={(choice) => setKidAge(i, choice)}
              disabled={disabled}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrap: { marginTop: spacing.md },
    heading: {
      fontSize: typography.lg,
      color: semanticColors.textPrimary,
      marginBottom: spacing.xs,
      ...typeface('bold'),
    },
    hint: {
      fontSize: typography.md,
      color: semanticColors.textSecondary,
      marginBottom: spacing.md,
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    label: {
      fontSize: typography.md,
      color: semanticColors.textPrimary,
      ...typeface('medium'),
    },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semanticColors.brand,
      backgroundColor: semanticColors.bgPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: {
      fontSize: typography.lg,
      color: semanticColors.textPrimary,
      ...typeface('medium'),
    },
    count: {
      fontSize: typography.xl,
      color: semanticColors.textPrimary,
      minWidth: 24,
      textAlign: 'center',
      ...typeface('bold'),
    },
    kidBlock: {
      alignSelf: 'stretch',
      width: '100%',
      marginBottom: spacing.sm,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: semanticColors.border,
      marginBottom: spacing.sm,
    },
    ageInline: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      flexWrap: 'nowrap',
    },
    fieldLabel: {
      width: 48,
      marginTop: 12,
      fontSize: typography.sm,
      color: semanticColors.textPrimary,
      ...typeface('medium'),
    },
  });
}
