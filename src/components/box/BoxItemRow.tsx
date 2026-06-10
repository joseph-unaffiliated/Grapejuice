import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { inferKeepOrToss } from '../../constants/boxPracticeGroups';
import { BoxItemImage } from './BoxItemImage';
import { ItemDetailSheet } from './ItemDetailSheet';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';
import type { KeepOrToss } from '../../types/pilot';

type Props = {
  li: BoxLineItem;
  item?: CatalogItem;
  meta?: string;
  showPrice?: boolean;
  locked: boolean;
  swapOptions: CatalogItem[];
  onSwap: (item: CatalogItem) => void;
  onToggleSurprise?: () => void;
  onSetKeepOrToss?: (value: KeepOrToss) => void;
  onAddAnother?: () => void;
  showAddAnother?: boolean;
  kidsMode?: boolean;
  formatPrice: (cents: number) => string;
  variant?: 'default' | 'card';
  onRemove?: () => void;
};

function itemTag(item?: CatalogItem, keepOrToss?: KeepOrToss): string {
  const kind = keepOrToss === 'keep' ? 'Keepsake' : 'Consumable';
  const ages = item?.ageGroups?.length === 4 ? 'All ages' : item?.ageGroups?.join(', ') ?? 'All ages';
  return `${ages} • ${kind}`;
}

function ActionChip({
  label,
  primary,
  onPress,
  disabled,
}: {
  label: string;
  primary?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, primary && styles.chipPrimary, disabled && styles.chipDisabled]}
      onPress={onPress}
      disabled={disabled || !onPress}
    >
      <Text style={[styles.chipText, primary && styles.chipTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function BoxItemRow({
  li,
  item,
  meta,
  showPrice,
  locked,
  swapOptions,
  onSwap,
  onToggleSurprise,
  onSetKeepOrToss,
  onAddAnother,
  showAddAnother,
  kidsMode = false,
  formatPrice,
  variant = 'default',
  onRemove,
}: Props) {
  const [shelfOpen, setShelfOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const keepOrToss = li.keepOrToss ?? inferKeepOrToss(li.slotId);
  const isSurprise = !!li.isSurprise;
  const swappable = !locked && swapOptions.length > 0;
  const displayName = kidsMode && isSurprise ? 'Wrapped surprise' : li.label ?? item?.name ?? li.itemId;

  if (variant === 'card') {
    return (
      <>
        <View style={styles.cardRow}>
          <TouchableOpacity style={styles.cardImageWrap} onPress={() => setDetailOpen(true)} activeOpacity={0.9}>
            <BoxItemImage size={130} imageUrl={item?.imageUrl} itemId={item?.id ?? li.itemId} />
          </TouchableOpacity>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTag}>{itemTag(item, keepOrToss)}</Text>
              <Text style={styles.cardName}>{displayName}</Text>
              {item?.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              ) : null}
              {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
              {isSurprise ? <Text style={styles.surpriseBadge}>Night-of surprise</Text> : null}
              {showPrice ? <Text style={styles.price}>{formatPrice(li.unitCents)}</Text> : null}
            </View>
            <View style={styles.cardActions}>
              <ActionChip label="In box" primary />
              {swappable ? (
                <ActionChip label="Swap" onPress={() => setShelfOpen((v) => !v)} />
              ) : null}
              {showAddAnother && onAddAnother && !locked ? (
                <ActionChip label="Add more" onPress={onAddAnother} />
              ) : null}
              {onRemove && !locked ? (
                <ActionChip label="Remove" onPress={onRemove} />
              ) : null}
            </View>
          </View>
        </View>

        {shelfOpen && swappable ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelf} contentContainerStyle={styles.shelfContent}>
            {swapOptions.map((opt) => {
              const selected = opt.id === li.itemId;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.shelfCard, selected && styles.shelfCardSelected, Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined]}
                  onPress={() => {
                    onSwap(opt);
                    setShelfOpen(false);
                  }}
                >
                  <BoxItemImage size={48} imageUrl={opt.imageUrl} itemId={opt.id} />
                  <Text style={styles.shelfName} numberOfLines={2}>{opt.name}</Text>
                  {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <ItemDetailSheet
          visible={detailOpen}
          item={item}
          lineItem={li}
          onClose={() => setDetailOpen(false)}
          onSwap={swappable ? () => { setDetailOpen(false); setShelfOpen(true); } : undefined}
        />
      </>
    );
  }

  return (
    <>
      <View style={styles.row}>
        <TouchableOpacity style={styles.body} onPress={() => setDetailOpen(true)} activeOpacity={0.85}>
          <BoxItemImage size={56} imageUrl={item?.imageUrl} itemId={item?.id ?? li.itemId} />
          <View style={styles.text}>
            <Text style={styles.name}>{displayName}</Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            <View style={styles.badges}>
              <Text style={styles.badge}>
                {keepOrToss === 'keep' ? 'Keep (storage box)' : "Use it up — we'll send more next year"}
              </Text>
              {isSurprise ? <Text style={styles.surpriseBadge}>Night-of surprise</Text> : null}
            </View>
            {showPrice ? <Text style={styles.price}>{formatPrice(li.unitCents)}</Text> : null}
          </View>
        </TouchableOpacity>
        <View style={styles.actions}>
          {swappable ? (
            <TouchableOpacity onPress={() => setShelfOpen((v) => !v)} style={styles.swapBtn}>
              <Text style={styles.swapText}>{shelfOpen ? 'Close' : 'Swap'}</Text>
            </TouchableOpacity>
          ) : null}
          {onToggleSurprise && !locked ? (
            <TouchableOpacity onPress={onToggleSurprise} style={styles.surpriseBtn}>
              <Text style={styles.surpriseBtnText}>{isSurprise ? 'Surprise ✓' : 'Surprise?'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {showAddAnother && onAddAnother && !locked ? (
        <TouchableOpacity style={styles.addAnother} onPress={onAddAnother}>
          <Text style={styles.addAnotherText}>+ Add another</Text>
        </TouchableOpacity>
      ) : null}

      {onSetKeepOrToss ? (
        <View style={styles.keepRow}>
          <TouchableOpacity
            style={[styles.keepBtn, keepOrToss === 'keep' && styles.keepBtnOn]}
            onPress={() => onSetKeepOrToss('keep')}
          >
            <Text style={styles.keepText}>Keep</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.keepBtn, keepOrToss === 'toss' && styles.keepBtnOn]}
            onPress={() => onSetKeepOrToss('toss')}
          >
            <Text style={styles.keepText}>Toss</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {shelfOpen && swappable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelf} contentContainerStyle={styles.shelfContent}>
          {swapOptions.map((opt) => {
            const selected = opt.id === li.itemId;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.shelfCard, selected && styles.shelfCardSelected, Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined]}
                onPress={() => {
                  onSwap(opt);
                  setShelfOpen(false);
                }}
              >
                <BoxItemImage size={48} imageUrl={opt.imageUrl} itemId={opt.id} />
                <Text style={styles.shelfName} numberOfLines={2}>{opt.name}</Text>
                {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <ItemDetailSheet
        visible={detailOpen}
        item={item}
        lineItem={li}
        onClose={() => setDetailOpen(false)}
        onSwap={swappable ? () => { setDetailOpen(false); setShelfOpen(true); } : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cardRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  cardImageWrap: { width: 130 },
  cardBody: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.xs },
  cardTop: { gap: 4 },
  cardTag: { fontSize: typography.sm, color: semanticColors.goldMuted },
  cardName: { fontWeight: '600', fontSize: typography.md, color: semanticColors.textPrimary },
  cardDesc: { fontSize: typography.sm, color: semanticColors.textSecondary, lineHeight: 16 },
  cardMeta: { fontSize: typography.sm, color: semanticColors.goldMuted },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  chip: {
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: semanticColors.bgPrimary,
  },
  chipPrimary: { backgroundColor: semanticColors.textPrimary, borderColor: semanticColors.textPrimary },
  chipDisabled: { opacity: 0.6 },
  chipText: { fontSize: 9, color: semanticColors.goldMuted, fontWeight: '500', textTransform: 'lowercase' },
  chipTextPrimary: { color: semanticColors.goldMuted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: semanticColors.border },
  body: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  text: { flex: 1 },
  name: { fontWeight: '600', fontSize: typography.lg },
  meta: { fontSize: typography.sm, color: semanticColors.goldMuted, marginTop: 2 },
  badges: { marginTop: 4, gap: 2 },
  badge: { fontSize: typography.sm, color: semanticColors.textTertiary },
  surpriseBadge: { fontSize: typography.sm, color: semanticColors.brand, fontWeight: '600' },
  price: { fontSize: typography.md, fontWeight: '600', marginTop: 4 },
  actions: { alignItems: 'flex-end', gap: spacing.xs },
  swapBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  swapText: { color: semanticColors.brand, fontWeight: '600' },
  surpriseBtn: { paddingHorizontal: spacing.xs },
  surpriseBtnText: { fontSize: typography.sm, color: semanticColors.textSecondary },
  keepRow: { flexDirection: 'row', gap: spacing.xs, paddingLeft: 64, marginBottom: spacing.xs },
  keepBtn: { borderWidth: 1, borderColor: semanticColors.border, borderRadius: borderRadius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  keepBtnOn: { borderColor: semanticColors.brand, backgroundColor: semanticColors.brandLight },
  keepText: { fontSize: typography.sm, color: semanticColors.textSecondary },
  addAnother: { paddingVertical: spacing.xs, paddingLeft: 64 },
  addAnotherText: { color: semanticColors.brand, fontWeight: '600', fontSize: typography.sm },
  shelf: { marginBottom: spacing.sm },
  shelfContent: { gap: spacing.sm, paddingVertical: spacing.sm },
  shelfCard: {
    width: 100,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: semanticColors.bgPrimary,
    borderWidth: 1,
    borderColor: semanticColors.border,
    alignItems: 'center',
  },
  shelfCardSelected: { borderColor: semanticColors.goldMuted, backgroundColor: semanticColors.accentCream },
  shelfName: { fontSize: typography.sm, textAlign: 'center', marginTop: 4 },
  selectedMark: { color: semanticColors.brand, fontWeight: '700', marginTop: 2 },
});
