import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import type { RavBlock, CatalogItem, BoxLineItem } from '../../types/pilot';
import { catalogService } from '../../services/firestore/catalog';
import { BoxItemImage } from '../box/BoxItemImage';
import { formatDollars, unitCentsForTier } from '../../services/box/buildDefaultBox';
import { inferPricingTier } from '../../services/box/pricing';
import { spacing, typography, borderRadius, shadows, shadowsWeb } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Props = {
  blocks: RavBlock[];
  lineItems: BoxLineItem[];
  boxLocked?: boolean;
  paymentGated?: boolean;
  onSwap: (slotId: string, item: CatalogItem) => void;
  onAddExtra?: (item: CatalogItem) => void;
  guardMutation?: () => boolean;
};

const goldCardShadow = Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : shadows.goldGlow;
const CURATION_PREVIEW = 6;

function CurationBlock({
  block,
  blockIndex,
  items,
  lineItems,
  boxLocked,
  onSwap,
  onAddExtra,
  styles,
  guardMutation,
}: {
  block: RavBlock;
  blockIndex: number;
  items: CatalogItem[];
  lineItems: BoxLineItem[];
  boxLocked?: boolean;
  onSwap: (slotId: string, item: CatalogItem) => void;
  onAddExtra?: (item: CatalogItem) => void;
  styles: ReturnType<typeof createRavBlockStyles>;
  guardMutation?: () => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, CURATION_PREVIEW);
  const hasMore = items.length > CURATION_PREVIEW;

  const handleItemPress = (item: CatalogItem) => {
    if (boxLocked) return;
    if (guardMutation && !guardMutation()) return;
    const slot = lineItems.find((li) => li.itemId === item.id || li.slotId === block.slotId);
    if (slot) onSwap(slot.slotId, item);
    else onAddExtra?.(item);
  };

  return (
    <View key={blockIndex} style={[styles.curationCard, goldCardShadow]}>
      <Text style={styles.curationTitle}>{block.title}</Text>
      <View style={styles.curationGrid}>
        {visible.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.gridItem, boxLocked && styles.gridItemDisabled]}
            onPress={() => handleItemPress(item)}
            disabled={boxLocked}
          >
            <BoxItemImage size={100} imageUrl={item.imageUrl} itemId={item.id} style={styles.gridImage} />
            <Text style={styles.gridLabel} numberOfLines={2}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {hasMore ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
          <Text style={styles.seeMore}>{expanded ? 'see less' : `see more (${items.length - CURATION_PREVIEW})`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function RavBlockRenderer({
  blocks,
  lineItems,
  boxLocked,
  paymentGated,
  onSwap,
  onAddExtra,
  guardMutation,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createRavBlockStyles(colors), [colors]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  useEffect(() => {
    catalogService.getAll().then(setCatalog);
  }, []);

  if (!blocks.length) return null;

  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => {
        if (block.type === 'curation' && block.swapOptions?.length) {
          const items = catalog.filter((c) => block.swapOptions!.includes(c.id));
          if (!items.length) return null;
          return (
            <CurationBlock
              key={i}
              block={block}
              blockIndex={i}
              items={items}
              lineItems={lineItems}
              boxLocked={boxLocked}
              onSwap={onSwap}
              onAddExtra={onAddExtra}
              guardMutation={paymentGated ? guardMutation : undefined}
              styles={styles}
            />
          );
        }

        if (block.type === 'product' && block.itemId) {
          const item = catalog.find((c) => c.id === block.itemId);
          if (!item) return null;
          const tier = inferPricingTier(item);
          const price = unitCentsForTier(tier, item.dollarCostCents);
          return (
            <View key={i} style={[styles.productCard, goldCardShadow]}>
              <BoxItemImage size={72} imageUrl={item.imageUrl} itemId={item.id} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{block.title || item.name}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>
                  {block.body || item.description}
                </Text>
                {price > 0 ? <Text style={styles.price}>{formatDollars(price)}</Text> : null}
              </View>
              <TouchableOpacity
                style={[styles.chipBtn, boxLocked && styles.chipBtnDisabled]}
                disabled={boxLocked}
                onPress={() => {
                  if (boxLocked) return;
                  if (paymentGated && guardMutation && !guardMutation()) return;
                  const slot = lineItems.find((li) => li.itemId === item.id || li.slotId === block.slotId);
                  if (slot) onSwap(slot.slotId, item);
                  else onAddExtra?.(item);
                }}
              >
                <Text style={styles.chipBtnText}>{block.slotId ? 'Swap in' : 'Add to box'}</Text>
              </TouchableOpacity>
            </View>
          );
        }

        if (block.type === 'swap' && block.itemId && block.slotId) {
          const current = catalog.find((c) => c.id === block.itemId);
          const suggested = catalog.find((c) => c.id === block.swapOptions?.[0]);
          if (!current || !suggested) return null;
          return (
            <View key={i} style={[styles.swapCard, goldCardShadow]}>
              <Text style={styles.cardTitle}>{block.title || 'Suggested swap'}</Text>
              <Text style={styles.cardBody}>
                {current.name} → {suggested.name}
              </Text>
              <TouchableOpacity
                style={[styles.chipBtn, boxLocked && styles.chipBtnDisabled]}
                disabled={boxLocked}
                onPress={() => {
                  if (boxLocked) return;
                  if (paymentGated && guardMutation && !guardMutation()) return;
                  onSwap(block.slotId!, suggested);
                }}
              >
                <Text style={styles.chipBtnText}>Make this swap</Text>
              </TouchableOpacity>
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}

function createRavBlockStyles(colors: SemanticColors) {
  return StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: spacing.md, width: '100%' },
  curationCard: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 16,
    padding: spacing.md,
    width: '100%',
  },
  curationTitle: {
    fontSize: typography.lg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  curationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  gridItem: { width: 100, alignItems: 'flex-start' },
  gridItemDisabled: { opacity: 0.5 },
  gridImage: { borderRadius: borderRadius.md },
  gridLabel: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.textPrimary,
    marginTop: 4,
  },
  seeMore: {
    fontSize: typography.sm,
    fontWeight: '200',
    color: colors.goldMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderRadius: 16,
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: typography.lg, color: colors.textPrimary },
  cardBody: { fontSize: typography.sm, fontWeight: '200', color: colors.textSecondary, marginTop: 2 },
  price: { fontSize: typography.sm, fontWeight: '600', marginTop: 4, color: colors.textPrimary },
  chipBtn: {
    borderWidth: 0.5,
    borderColor: colors.brand,
    borderRadius: borderRadius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipBtnDisabled: { opacity: 0.5 },
  chipBtnText: { fontSize: typography.sm, fontWeight: '200', color: colors.textPrimary },
  swapCard: {
    padding: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderRadius: 16,
    gap: spacing.xs,
  },
  });
}
