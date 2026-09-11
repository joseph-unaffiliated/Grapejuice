import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { BoxSectionUpsellStrip } from './BoxSectionUpsellStrip';
import { spacing, typography, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  /** e.g. "Add a gift for Sam". */
  title: string;
  /** Secondary line, e.g. "This gift was donated — pick one to add it back.". */
  note?: string;
  items: CatalogItem[];
  onPressItem: (item: CatalogItem) => void;
};

/**
 * A per-kid "add a gift / book" affordance: a titled thumbnail rail of included
 * ($0) options. Used in Give Presents (gifts) and Tell the Story (books) when a
 * kid is missing a distinct gift/book.
 */
export function PerKidSlotAddBlock({ title, note, items, onPressItem }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const includedItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  if (!items.length) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <BoxSectionUpsellStrip
        items={items}
        onPressItem={onPressItem}
        label=""
        includedItemIds={includedItemIds}
        tileSize="medium"
      />
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: {
      width: '100%',
      marginTop: spacing.md,
    },
    header: {
      width: '100%',
      alignItems: 'center',
      gap: 2,
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: typography.md,
      ...typeface('medium'),
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    note: {
      fontSize: typography.sm,
      ...typeface('regular'),
      color: colors.goldMuted,
      letterSpacing: -0.22,
      textAlign: 'center',
    },
  });
}
