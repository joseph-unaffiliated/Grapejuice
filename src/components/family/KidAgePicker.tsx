import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import {
  LAYOUT,
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

/** Numeric ages plus optional teen / adult bands (onboarding includes `18+`). */
export type KidAgeChoice = number | '13-17' | '18+';

export const GIFT_KID_AGE_CHOICES: KidAgeChoice[] = [
  ...Array.from({ length: 13 }, (_, i) => i),
  '13-17',
];

export const ONBOARDING_KID_AGE_CHOICES: KidAgeChoice[] = [
  ...Array.from({ length: 13 }, (_, i) => i),
  '13-17',
  '18+',
];

type Props = {
  choices: readonly KidAgeChoice[];
  isSelected: (choice: KidAgeChoice) => boolean;
  onSelect: (choice: KidAgeChoice) => void;
  disabled?: boolean;
  /** Force chip row even on narrow screens (tests / desktop embeds). */
  forceChips?: boolean;
};

function labelForChoice(choice: KidAgeChoice): string {
  return String(choice);
}

function selectedLabel(choices: readonly KidAgeChoice[], isSelected: (c: KidAgeChoice) => boolean): string {
  const hit = choices.find((c) => isSelected(c));
  if (hit == null) return 'Select age';
  if (typeof hit === 'number') return `Age ${hit}`;
  return hit;
}

/**
 * Kid age control — chip strip on tablet+, tappable age pill + menu on mobile.
 */
export function KidAgePicker({
  choices,
  isSelected,
  onSelect,
  disabled,
  forceChips = false,
}: Props) {
  const { width } = useWindowDimensions();
  const useMenu = !forceChips && width < LAYOUT.BREAKPOINT_TABLET;
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => createStyles(), []);

  if (!useMenu) {
    return (
      <View style={styles.chipRow}>
        {choices.map((choice) => {
          const on = isSelected(choice);
          const isBand = typeof choice === 'string';
          return (
            <TouchableOpacity
              key={String(choice)}
              style={[styles.chip, isBand && styles.chipBand, on && styles.chipOn]}
              onPress={() => onSelect(choice)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text
                style={[styles.chipText, isBand && styles.chipTextBand, on && styles.chipTextOn]}
                numberOfLines={1}
              >
                {labelForChoice(choice)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.menuWrap}>
      <TouchableOpacity
        style={[styles.pill, open && styles.pillOpen, disabled && styles.pillDisabled]}
        onPress={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        accessibilityLabel={selectedLabel(choices, isSelected)}
      >
        <Text style={styles.pillText}>{selectedLabel(choices, isSelected)}</Text>
        <Icon
          icon={icons.chevronDown}
          size={12}
          color={semanticColors.logoDark}
          style={open ? styles.chevronOpen : undefined}
        />
      </TouchableOpacity>
      {open ? (
        <View style={styles.menu} accessibilityRole="menu">
          {choices.map((choice) => {
            const on = isSelected(choice);
            return (
              <TouchableOpacity
                key={String(choice)}
                style={[styles.menuItem, on && styles.menuItemOn]}
                onPress={() => {
                  onSelect(choice);
                  setOpen(false);
                }}
                disabled={disabled}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.menuItemText, on && styles.menuItemTextOn]}>
                  {typeof choice === 'number' ? choice : choice}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    chipRow: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: 2,
      minWidth: 0,
    },
    chip: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      paddingHorizontal: 1,
      paddingVertical: 3,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semanticColors.brand,
      backgroundColor: semanticColors.bgPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipBand: {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      paddingHorizontal: 4,
    },
    chipOn: { backgroundColor: '#000000' },
    chipText: {
      ...typeface('light'),
      fontSize: typography.xs,
      color: '#000000',
    },
    chipTextBand: {
      ...typeface('regular'),
      fontSize: typography.xs,
    },
    chipTextOn: {
      color: '#FFFFFF',
      ...typeface('medium'),
    },
    menuWrap: {
      flex: 1,
      minWidth: 0,
      position: 'relative',
      zIndex: 2,
    },
    pill: {
      minHeight: 44,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semanticColors.brand,
      backgroundColor: semanticColors.bgPrimary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    pillOpen: {
      borderColor: semanticColors.logoDark,
    },
    pillDisabled: { opacity: 0.5 },
    pillText: {
      ...typeface('medium'),
      fontSize: typography.md,
      color: semanticColors.logoDark,
      flex: 1,
    },
    chevronOpen: {
      transform: [{ rotate: '180deg' }],
    },
    menu: {
      marginTop: spacing.xs,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semanticColors.border,
      backgroundColor: semanticColors.bgPrimary,
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: '0 8px 24px rgba(17, 2, 34, 0.12)',
          } as object)
        : {
            shadowColor: '#110222',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 4,
          }),
    },
    menuItem: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semanticColors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semanticColors.bgPrimary,
    },
    menuItemOn: {
      backgroundColor: '#000000',
      borderColor: '#000000',
    },
    menuItemText: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: '#000000',
    },
    menuItemTextOn: {
      color: '#FFFFFF',
      ...typeface('medium'),
    },
  });
}
