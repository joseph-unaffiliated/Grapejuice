import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import type { CatalogItem } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import { semanticColors, spacing, typography, borderRadius } from '../../constants/theme';

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

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, gap: spacing.md },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: semanticColors.goldMuted,
    width: '100%',
  },
  header: { alignItems: 'center', gap: 4 },
  title: { fontSize: typography.md, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: typography.sm, fontWeight: '200', color: semanticColors.textSecondary, textAlign: 'center' },
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
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: semanticColors.bgPrimary,
  },
  chipText: {
    fontSize: 9,
    color: semanticColors.textPrimary,
    fontWeight: '500',
    textTransform: 'lowercase',
  },
  meta: { fontSize: typography.sm, color: semanticColors.goldMuted, marginTop: 4 },
  name: { fontSize: typography.md, fontWeight: '600', color: semanticColors.textPrimary },
  desc: { fontSize: typography.sm, color: semanticColors.textSecondary, lineHeight: 16 },
});
