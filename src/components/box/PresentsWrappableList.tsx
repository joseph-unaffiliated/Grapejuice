import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  formatPresentAttribution,
  wrappableLinesInBox,
  type CoalescedBoxLine,
} from './boxLineDisplay';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  lineItems: BoxLineItem[];
  catalog: CatalogItem[];
  childrenProfiles: ChildProfile[];
  onOpenProduct?: (itemId: string) => void;
  /** Controlled selection of itemIds marked “to be wrapped”. */
  selectedItemIds?: ReadonlySet<string> | string[];
  onToggleWrapSelection?: (itemId: string) => void;
};

/**
 * Give Presents checklist — sits below the wrapping-paper listing.
 * Tap a chip to outline it and move it into “To be wrapped” (tap again to undo).
 * Wrap mode is chosen via the wrapping-paper card primary action.
 */
export function PresentsWrappableList({
  lineItems,
  catalog,
  childrenProfiles,
  onOpenProduct,
  selectedItemIds: selectedProp,
  onToggleWrapSelection,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [localSelected, setLocalSelected] = useState<Set<string>>(() => new Set());

  const selected = useMemo(() => {
    if (selectedProp) {
      return selectedProp instanceof Set ? selectedProp : new Set(selectedProp);
    }
    return localSelected;
  }, [selectedProp, localSelected]);

  const wrappable = useMemo(
    () => coalesceLinesByItemId(wrappableLinesInBox(lineItems, catalog)),
    [lineItems, catalog]
  );

  const toggle = (itemId: string) => {
    if (onToggleWrapSelection) {
      onToggleWrapSelection(itemId);
      return;
    }
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toWrap = wrappable.filter((row) => selected.has(row.itemId));
  const remaining = wrappable.filter((row) => !selected.has(row.itemId));

  const renderChip = (row: CoalescedBoxLine, outlined: boolean) => {
    const item = catalog.find((c) => c.id === row.itemId);
    const names = childNamesForLines(row.lines, childrenProfiles);
    const attribution = formatPresentAttribution(names);
    const label = row.primary.label ?? item?.name ?? row.itemId;
    return (
      <TouchableOpacity
        key={row.key}
        style={[styles.chip, outlined && styles.chipSelected]}
        onPress={() => toggle(row.itemId)}
        onLongPress={onOpenProduct ? () => onOpenProduct(row.itemId) : undefined}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: outlined }}
        accessibilityLabel={`${label}${row.quantity > 1 ? ` ×${row.quantity}` : ''}${
          outlined ? ', selected for wrapping' : ''
        }`}
      >
        <BoxItemImage
          size={36}
          imageUrl={item?.imageUrl}
          itemId={item?.id ?? row.itemId}
          style={styles.thumb}
        />
        <View style={styles.chipTextCol}>
          <Text style={styles.chipTitle} numberOfLines={2}>
            {label}
            {row.quantity > 1 ? ` ×${row.quantity}` : ''}
          </Text>
          {attribution ? (
            <Text style={styles.chipMeta} numberOfLines={1}>
              {attribution}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      {toWrap.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.heading}>To be wrapped</Text>
          <View style={styles.list}>{toWrap.map((row) => renderChip(row, true))}</View>
        </View>
      ) : null}
      <View style={styles.group}>
        <Text style={styles.heading}>Wrappable in this box</Text>
        {wrappable.length === 0 ? (
          <Text style={styles.empty}>
            Nothing wrappable yet — presents show under their practices above.
          </Text>
        ) : remaining.length === 0 ? (
          <Text style={styles.empty}>All wrappable items are marked to be wrapped.</Text>
        ) : (
          <View style={styles.list}>{remaining.map((row) => renderChip(row, false))}</View>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: { gap: spacing.md, width: '100%' },
    group: { gap: spacing.sm, width: '100%' },
    heading: {
      fontSize: typography.md,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.26,
    },
    empty: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.textSecondary,
      lineHeight: 18,
    },
    list: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
      borderRadius: borderRadius.md,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.bgPrimary,
      maxWidth: '100%',
    },
    chipSelected: {
      borderWidth: 1.5,
      borderColor: colors.textPrimary,
      backgroundColor: colors.accentCream,
    },
    thumb: { borderRadius: borderRadius.sm, overflow: 'hidden' },
    chipTextCol: { flexShrink: 1, gap: 2, maxWidth: 180 },
    chipTitle: {
      fontSize: typography.sm,
      ...typeface('regular'),
      color: colors.textPrimary,
      letterSpacing: -0.33,
    },
    chipMeta: {
      fontSize: 10,
      ...typeface('light'),
      color: colors.goldMuted,
      letterSpacing: -0.2,
    },
  });
}
