import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  title: string;
  items: CatalogItem[];
  locked: boolean;
  formatPrice: (cents: number) => string;
  onAdd: (item: CatalogItem) => void;
  onSwapIn: (item: CatalogItem) => void;
};

function itemMeta(item: CatalogItem): string {
  const ages = item.ageGroups?.length === 4 ? 'All ages' : item.ageGroups?.join('–') ?? 'All ages';
  return ages;
}

export function BoxBrowseGrid({ title, items, locked, formatPrice, onAdd, onSwapIn }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createBrowseGridStyles(colors), [colors]);

  if (!items.length) return null;

  return (
    <View style={styles.block}>
      <View style={styles.divider} />
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Add these items to your box</Text>
      </View>
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <BoxItemImage size={130} imageUrl={item.imageUrl} itemId={item.id} style={styles.image} />
            <View style={styles.actions}>
              {item.dollarCostCents > 0 ? (
                <TouchableOpacity
                  style={styles.chip}
                  disabled={locked}
                  onPress={() => onAdd(item)}
                >
                  <Text style={styles.chipText}>Add for {formatPrice(item.dollarCostCents)}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.chip}
                disabled={locked}
                onPress={() => onSwapIn(item)}
              >
                <Text style={styles.chipText}>swap in</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.meta}>{itemMeta(item)}</Text>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const CARD_WIDTH = '48%';

function createBrowseGridStyles(colors: SemanticColors) {
  return StyleSheet.create({
    block: { marginTop: spacing.lg, gap: spacing.md },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.goldMuted,
      width: '100%',
    },
    header: { alignItems: 'center', gap: 4 },
    title: { fontSize: typography.md, fontWeight: '600', textAlign: 'center' },
    subtitle: { fontSize: typography.sm, fontWeight: '200', color: colors.textSecondary, textAlign: 'center' },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: spacing.lg,
    },
    card: { width: CARD_WIDTH, gap: 4 },
    image: { width: '100%', borderRadius: borderRadius.md },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
    chip: {
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
      borderRadius: borderRadius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: colors.bgPrimary,
    },
    chipText: {
      fontSize: typography.sm,
      fontWeight: '200',
      color: colors.textPrimary,
      textTransform: 'lowercase',
    },
    meta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 4 },
    name: { fontSize: typography.md, fontWeight: '600', color: colors.textPrimary },
    desc: { fontSize: typography.sm, color: colors.textSecondary, lineHeight: 16 },
  });
}
