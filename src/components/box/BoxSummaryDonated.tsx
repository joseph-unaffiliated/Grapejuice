import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { parseDonationDollarsToCents } from './boxLineDisplay';
import { spacing, typography, typeface, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';

export const DONATION_TOOLTIP =
  'About donations: Unclaimed items contribute to Hanukkah kits we give to people at no cost who otherwise would not celebrate the holiday. Thank you for your contribution!';

type Props = {
  /** Unclaimed included-item value (gold) — does not affect Total. */
  cents: number;
  /** Extra cash donation (white) — charged in Total. */
  cashDonationCents?: number;
  /** When set, click to add/edit cash donation. */
  onCashDonationChange?: (cents: number) => void;
  labelStyle?: TextStyle;
  valueStyle?: TextStyle;
  itemStyle?: ViewStyle;
};

/** Summary chip: Donated $X (gold) + optional `+$N` cash gift (white, in Total). */
export function BoxSummaryDonated({
  cents,
  cashDonationCents = 0,
  onCashDonationChange,
  labelStyle,
  valueStyle,
  itemStyle,
}: Props) {
  const { colors } = useThemeMode();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  /** After typing/submit, keep tooltip down until the pointer leaves Donated. */
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const canEditCash = typeof onCashDonationChange === 'function';

  const kitsCents = Math.max(0, cents);
  const cashCents = Math.max(0, cashDonationCents);
  const kitsAmount = formatCatalogDollars(kitsCents);
  const cashDollarsLabel =
    cashCents > 0 ? String(Math.round(cashCents / 100)) : '';

  useEffect(() => {
    if (editing) {
      const t = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [editing]);

  if (kitsCents <= 0 && cashCents <= 0 && !editing) return null;

  const commitCash = () => {
    if (!onCashDonationChange) {
      setEditing(false);
      setTooltipDismissed(true);
      return;
    }
    onCashDonationChange(parseDonationDollarsToCents(draft));
    setEditing(false);
    setTooltipDismissed(true);
  };

  const startEdit = () => {
    if (!canEditCash || editing) return;
    setDraft(cashCents > 0 ? String(Math.round(cashCents / 100)) : '');
    setEditing(true);
    setHovered(true);
  };

  // `+$` (and amount) stay visible while hovered, editing, or after a cash gift is set.
  const showCashAffordance =
    canEditCash && (hovered || editing || cashCents > 0);
  const showTooltip = hovered && !tooltipDismissed;

  return (
    <Pressable
      onPress={canEditCash ? startEdit : undefined}
      disabled={!canEditCash}
      accessibilityRole={canEditCash ? 'button' : 'text'}
      accessibilityLabel={
        cashCents > 0
          ? `Donated ${kitsAmount} in kits and $${cashDollarsLabel} cash. ${DONATION_TOOLTIP}`
          : `Donated ${kitsAmount}. ${DONATION_TOOLTIP}`
      }
      style={[
        styles.item,
        itemStyle,
        Platform.OS === 'web'
          ? ({ cursor: canEditCash ? 'pointer' : 'default' } as ViewStyle)
          : null,
      ]}
      {...(Platform.OS === 'web'
        ? ({
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => {
              if (!editing) {
                setHovered(false);
                setTooltipDismissed(false);
              }
            },
            title: tooltipDismissed ? undefined : DONATION_TOOLTIP,
          } as object)
        : null)}
    >
      <Text style={[styles.label, { color: colors.goldMuted }, labelStyle]}>Donated</Text>
      {kitsCents > 0 ? (
        <Text style={[styles.value, { color: colors.brand }, valueStyle]}>{kitsAmount}</Text>
      ) : null}
      {showCashAffordance ? (
        <View style={styles.cashRow} pointerEvents={editing ? 'box-none' : 'none'}>
          <Text style={[styles.value, valueStyle, styles.cashValue]}>+</Text>
          <View style={styles.cashAmount}>
            <Text style={[styles.value, valueStyle, styles.cashValue]}>$</Text>
            {editing ? (
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={(text) => {
                  setTooltipDismissed(true);
                  setDraft(text);
                }}
                onBlur={commitCash}
                onSubmitEditing={commitCash}
                keyboardType="decimal-pad"
                inputMode="decimal"
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={[styles.cashInput, valueStyle, styles.cashValue]}
                accessibilityLabel="Cash donation amount in dollars"
                onPressIn={(e) => e.stopPropagation?.()}
              />
            ) : cashCents > 0 ? (
              <Text style={[styles.value, valueStyle, styles.cashValue]}>{cashDollarsLabel}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {showTooltip ? (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: colors.bgElevated, borderColor: colors.goldMuted },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.tooltipText, { color: colors.textPrimary }]}>
            {DONATION_TOOLTIP}
            {canEditCash
              ? ' Click to add an optional cash donation — that amount is added to your total.'
              : ''}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  label: {
    fontSize: typography.sm,
    ...typeface('medium'),
    letterSpacing: -0.22,
  },
  value: {
    fontSize: typography.titleLg,
    ...typeface('light'),
    letterSpacing: -0.32,
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    // Match parent `item` gap (kits $23 ↔ +); $ sticks to the amount.
    gap: spacing.xs,
  },
  cashAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  cashValue: {
    color: '#FFFFFF',
  },
  cashInput: {
    minWidth: 28,
    maxWidth: 72,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    fontSize: typography.titleLg,
    lineHeight: typography.titleLg + 2,
    ...typeface('light'),
    letterSpacing: -0.32,
    color: '#FFFFFF',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          caretColor: '#FFFFFF',
        } as object)
      : null),
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    marginBottom: 8,
    width: 280,
    maxWidth: 320,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        } as object)
      : null),
  },
  tooltipText: {
    fontSize: typography.sm,
    lineHeight: 18,
    ...typeface('regular'),
    letterSpacing: -0.2,
  },
});
