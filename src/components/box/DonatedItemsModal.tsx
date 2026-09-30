import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { BoxItemImage } from './BoxItemImage';
import { parseDonationDollarsToCents } from './boxLineDisplay';
import { DONATION_TOOLTIP } from './BoxSummaryDonated';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';

export type DonatedItemRow = {
  itemId: string;
  name: string;
  imageUrl?: string | null;
  /** Units donated (baseline minus what's still in the box). */
  quantity: number;
  /** Whether “swap something else in” has any options for this item. */
  canSwap: boolean;
};

type Props = {
  visible: boolean;
  items: DonatedItemRow[];
  cashDonationCents: number;
  /** Omit to make the cash field read-only (locked / view-only). */
  onCashDonationChange?: (cents: number) => void;
  onRestore?: (itemId: string) => void;
  onSwapIn?: (itemId: string) => void;
  onClose: () => void;
};

const IMAGE_SIZE = 56;

/** Donated summary → list of donated items (restore / swap in) plus an optional cash gift. */
export function DonatedItemsModal({
  visible,
  items,
  cashDonationCents,
  onCashDonationChange,
  onRestore,
  onSwapIn,
  onClose,
}: Props) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft(cashDonationCents > 0 ? String(Math.round(cashDonationCents / 100)) : '');
    }
  }, [visible, cashDonationCents]);

  if (!visible) return null;

  const commitAndClose = () => {
    if (onCashDonationChange) {
      const next = parseDonationDollarsToCents(draft);
      if (next !== cashDonationCents) onCashDonationChange(next);
    }
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={commitAndClose}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={commitAndClose}
          accessibilityLabel="Close donated items"
        />
        <View style={styles.sheet} accessibilityRole="dialog" accessibilityLabel="Your donated items">
          <Text style={styles.title}>Your donated items</Text>
          <Text style={styles.blurb}>{DONATION_TOOLTIP}</Text>

          {items.length ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {items.map((row) => (
                <View key={row.itemId} style={styles.row}>
                  <BoxItemImage size={IMAGE_SIZE} imageUrl={row.imageUrl} itemId={row.itemId} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName} numberOfLines={2}>
                      {row.name}
                      {row.quantity > 1 ? ` ×${row.quantity}` : ''}
                    </Text>
                    {onRestore || onSwapIn ? (
                      <View style={styles.rowActions}>
                        {onRestore ? (
                          <TouchableOpacity
                            style={[styles.chip, styles.chipPrimary]}
                            onPress={() => onRestore(row.itemId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Restore ${row.name} to your box`}
                          >
                            <Text style={[styles.chipText, styles.chipTextPrimary]}>restore</Text>
                          </TouchableOpacity>
                        ) : null}
                        {onSwapIn && row.canSwap ? (
                          <TouchableOpacity
                            style={styles.chip}
                            onPress={() => onSwapIn(row.itemId)}
                            accessibilityRole="button"
                            accessibilityLabel={`Swap something else in for ${row.name}`}
                          >
                            <Text style={styles.chipText}>swap something else in</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.empty}>You haven’t donated any items.</Text>
          )}

          <View style={styles.cashBlock}>
            <Text style={styles.cashLabel}>Add a cash donation</Text>
            <View style={styles.cashField}>
              <Text style={styles.cashPrefix}>$</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={commitAndClose}
                editable={!!onCashDonationChange}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0"
                placeholderTextColor={semanticColors.textSecondary}
                style={styles.cashInput}
                accessibilityLabel="Cash donation amount in dollars"
              />
            </View>
            <Text style={styles.cashHint}>Added to your total.</Text>
          </View>

          <TouchableOpacity
            style={styles.done}
            onPress={commitAndClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 2, 34, 0.45)',
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: semanticColors.bgPrimary,
    borderRadius: borderRadius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 16px 40px rgba(17, 2, 34, 0.2)' } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
          elevation: 12,
        }),
  },
  title: {
    ...typeface('medium'),
    fontSize: 18,
    letterSpacing: -0.4,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  blurb: {
    ...typeface('regular'),
    fontSize: typography.sm,
    lineHeight: 18,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowBody: { flex: 1, gap: 6 },
  rowName: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
    letterSpacing: -0.2,
  },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: 12,
    minHeight: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPrimary: {
    backgroundColor: semanticColors.logoDark,
    borderColor: semanticColors.logoDark,
  },
  chipText: {
    ...typeface('regular'),
    fontSize: 12,
    color: semanticColors.goldMuted,
  },
  chipTextPrimary: { color: semanticColors.brand },
  empty: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textAlign: 'center',
  },
  cashBlock: {
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semanticColors.border,
  },
  cashLabel: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.logoDark,
  },
  cashField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 40,
  },
  cashPrefix: {
    ...typeface('regular'),
    fontSize: 16,
    color: semanticColors.logoDark,
  },
  cashInput: {
    flex: 1,
    ...typeface('regular'),
    fontSize: 16,
    color: semanticColors.logoDark,
    paddingVertical: 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  cashHint: {
    ...typeface('regular'),
    fontSize: 11,
    color: semanticColors.textSecondary,
  },
  done: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  doneText: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    textDecorationLine: 'underline',
  },
});
