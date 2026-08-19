import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import {
  borderRadius,
  semanticColors,
  typeface,
} from '../../constants/theme';

type Props = {
  quantity: number;
  onChange: (delta: 1 | -1) => void;
  disabled?: boolean;
  /** Used in accessibility labels, e.g. the product name. */
  label?: string;
};

/**
 * Compact − / qty / + control. At quantity 1, minus removes the line
 * (trash icon) instead of going to zero.
 */
export function CartQtyStepper({ quantity, onChange, disabled, label }: Props) {
  const qty = Math.max(1, quantity);
  const atOne = qty <= 1;
  const name = label?.trim() || 'item';

  return (
    <View style={[styles.row, disabled && styles.disabled]} accessibilityRole="adjustable">
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange(-1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={atOne ? `Remove ${name}` : `Decrease quantity of ${name}`}
      >
        {atOne ? (
          <Icon icon={icons.trash} size={11} color={semanticColors.goldMuted} />
        ) : (
          <Text style={styles.btnText}>−</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.value} accessibilityLabel={`Quantity ${qty}`}>
        {qty}
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => onChange(1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Increase quantity of ${name}`}
      >
        <Text style={styles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: 4,
    minHeight: 32,
    backgroundColor: semanticColors.bgPrimary,
  },
  disabled: { opacity: 0.55 },
  btn: {
    minWidth: 28,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  btnText: {
    ...typeface('regular'),
    fontSize: 14,
    lineHeight: 16,
    color: semanticColors.goldMuted,
  },
  value: {
    ...typeface('medium'),
    fontSize: 13,
    color: semanticColors.logoDark,
    minWidth: 16,
    textAlign: 'center',
  },
});
