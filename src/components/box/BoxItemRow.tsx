import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { inferKeepOrToss } from '../../constants/boxPracticeGroups';
import { BoxItemImage } from './BoxItemImage';
import { ItemDetailSheet } from './ItemDetailSheet';
import { useBoxItemVisualVariant } from './boxSectionItemsLayout';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { spacing, typography, borderRadius, shadowsWeb, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';
import type { KeepOrToss } from '../../types/pilot';

type BoxItemRowStyles = ReturnType<typeof createBoxItemRowStyles>;

type Props = {
  li: BoxLineItem;
  item?: CatalogItem;
  /** Status line above title: "Included", "Included  |  One for…/A gift for…", or "+$4". */
  meta?: string;
  showPrice?: boolean;
  locked: boolean;
  swapOptions: CatalogItem[];
  onSwap: (item: CatalogItem) => void;
  /**
   * Override primary Swap chip label (e.g. wrapping paper → “pre-wrap presents instead”).
   * When set with `onPrimarySwapAction`, pressing runs that action instead of opening the shelf.
   */
  swapLabel?: string;
  /** Direct primary action (skip shelf) — used for wrapping → pre-wrap. */
  onPrimarySwapAction?: () => void;
  onToggleSurprise?: () => void;
  onSetKeepOrToss?: (value: KeepOrToss) => void;
  /** Section-level “add more” is preferred for boxes; chip kept for rare callers. */
  onAddAnother?: () => void;
  showAddAnother?: boolean;
  formatPrice: (cents: number) => string;
  /** Override layout; defaults to section context (tile grid vs mobile card). */
  variant?: 'default' | 'card' | 'tile';
  onRemove?: () => void;
  /** Read-only reveal: show swap / add more / remove chips without handlers. */
  previewChips?: boolean;
  /** Display quantity (coalesced). Defaults to `li.quantity`. */
  quantity?: number;
  /**
   * À-la-carte / marketplace only. Do not pass for curated box lines —
   * those are one-per-slot (donate/remove + section “add more”).
   */
  onQuantityChange?: (delta: 1 | -1) => void;
  /**
   * Donate (included base) vs Remove (paid add-on) chip label when `onRemove` is set.
   * Defaults from `li.unitCents === 0`.
   */
  decrementMode?: 'donate' | 'remove';
  /** Prefer product page; falls back to ItemDetailSheet. */
  onOpenProduct?: () => void;
};

function ActionChip({
  label,
  primary,
  onPress,
  disabled,
  styles,
}: {
  label: string;
  primary?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  styles: BoxItemRowStyles;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, primary && styles.chipPrimary, disabled && styles.chipDisabled]}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, primary && styles.chipTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

function QtyStepper({
  quantity,
  locked,
  decrementMode,
  onQuantityChange,
  styles,
  colors,
}: {
  quantity: number;
  locked: boolean;
  decrementMode: 'donate' | 'remove';
  onQuantityChange?: (delta: 1 | -1) => void;
  styles: BoxItemRowStyles;
  colors: SemanticColors;
}) {
  if (!onQuantityChange || locked) {
    return quantity > 1 ? <Text style={styles.qtyReadonly}>×{quantity}</Text> : null;
  }
  const atOne = quantity <= 1;
  return (
    <View style={styles.qtyRow}>
      <TouchableOpacity
        style={[styles.qtyBtn, atOne && decrementMode === 'donate' && styles.qtyBtnDonate]}
        onPress={() => onQuantityChange(-1)}
        accessibilityRole="button"
        accessibilityLabel={atOne ? (decrementMode === 'donate' ? 'Donate' : 'Remove') : 'Decrease quantity'}
      >
        {atOne && decrementMode === 'remove' ? (
          <Icon icon={icons.trash} size={11} color={colors.goldMuted} />
        ) : (
          <Text
            style={[
              styles.qtyBtnText,
              atOne && decrementMode === 'donate' && styles.qtyBtnTextDonate,
            ]}
          >
            {atOne ? (decrementMode === 'donate' ? 'Donate' : '−') : '−'}
          </Text>
        )}
      </TouchableOpacity>
      <Text style={styles.qtyValue}>{quantity}</Text>
      <TouchableOpacity
        style={styles.qtyBtn}
        onPress={() => onQuantityChange(1)}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Text style={styles.qtyBtnText}>+</Text>
      </TouchableOpacity>
    </View>
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
  swapLabel,
  onPrimarySwapAction,
  onToggleSurprise,
  onSetKeepOrToss,
  onAddAnother,
  showAddAnother,
  formatPrice,
  variant,
  onRemove,
  previewChips = false,
  quantity: quantityProp,
  onQuantityChange,
  decrementMode,
  onOpenProduct,
}: Props) {
  const { colors } = useThemeMode();
  const layoutVariant = useBoxItemVisualVariant();
  const resolvedVariant = variant ?? (layoutVariant === 'tile' ? 'tile' : 'card');
  const styles = useMemo(() => createBoxItemRowStyles(colors), [colors]);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const keepOrToss = li.keepOrToss ?? inferKeepOrToss(li.slotId);
  const isSurprise = !PILOT_PARENT_ONLY && !!li.isSurprise;
  const showWrapControls = !PILOT_PARENT_ONLY && !!onToggleSurprise;
  const currentItemId = item?.id ?? li.itemId;
  const hasAlternateSwaps = swapOptions.some((opt) => opt.id !== currentItemId);
  // Hide Swap when the shelf would only show the current item (misleading).
  const swappable = !locked && (hasAlternateSwaps || !!onPrimarySwapAction);
  const displayName = li.label ?? item?.name ?? li.itemId;
  const quantity = Math.max(1, quantityProp ?? li.quantity ?? 1);
  const resolvedDecrement: 'donate' | 'remove' =
    decrementMode ?? (li.unitCents === 0 ? 'donate' : 'remove');
  const primarySwapLabel = swapLabel ?? 'Swap';

  const openDetail = () => {
    if (onOpenProduct) {
      onOpenProduct();
      return;
    }
    setDetailOpen(true);
  };

  const onPrimarySwapPress = () => {
    if (onPrimarySwapAction) {
      onPrimarySwapAction();
      setShelfOpen(false);
      return;
    }
    setShelfOpen((v) => !v);
  };

  const swapPrimary = (
    <ActionChip
      label={primarySwapLabel}
      primary
      styles={styles}
      disabled={previewChips || !swappable}
      onPress={previewChips ? undefined : onPrimarySwapPress}
    />
  );

  if (resolvedVariant === 'card' || resolvedVariant === 'tile') {
    const vertical = resolvedVariant === 'tile';
    return (
      <>
        <View style={vertical ? styles.tileCard : styles.cardRow}>
          <TouchableOpacity
            style={vertical ? styles.tileImageWrap : styles.cardImageWrap}
            onPress={openDetail}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={`Open ${displayName}`}
          >
            <BoxItemImage
              size={vertical ? 96 : 112}
              imageUrl={item?.imageUrl}
              itemId={item?.id ?? li.itemId}
              style={vertical ? styles.tileImage : styles.cardImage}
            />
          </TouchableOpacity>
          <View style={vertical ? styles.tileBody : styles.cardBody}>
            <View style={styles.cardTop}>
              {meta ? <Text style={styles.cardTag}>{meta}</Text> : null}
              <TouchableOpacity onPress={openDetail} activeOpacity={0.85}>
                <Text style={styles.cardName}>{displayName}</Text>
              </TouchableOpacity>
              {item?.description ? (
                <Text style={styles.cardDesc} numberOfLines={vertical ? 3 : 2}>
                  {item.description}
                </Text>
              ) : null}
              {isSurprise ? <Text style={styles.surpriseBadge}>Night-of surprise</Text> : null}
              {showPrice ? <Text style={styles.price}>{formatPrice(li.unitCents)}</Text> : null}
            </View>
            <View style={styles.cardActions}>
              {previewChips ? (
                <>
                  {swapPrimary}
                  <ActionChip label="Add more" styles={styles} disabled />
                  <ActionChip label="Remove" styles={styles} disabled />
                </>
              ) : (
                <>
                  {swappable ? swapPrimary : null}
                  {onQuantityChange || quantity > 1 ? (
                    <QtyStepper
                      quantity={quantity}
                      locked={locked}
                      decrementMode={resolvedDecrement}
                      onQuantityChange={onQuantityChange}
                      styles={styles}
                      colors={colors}
                    />
                  ) : showAddAnother && onAddAnother && !locked ? (
                    <ActionChip label="Add more" onPress={onAddAnother} styles={styles} />
                  ) : null}
                  {!onQuantityChange && onRemove && !locked ? (
                    <ActionChip
                      label={resolvedDecrement === 'donate' ? 'Donate' : 'Remove'}
                      onPress={onRemove}
                      styles={styles}
                    />
                  ) : null}
                </>
              )}
            </View>
          </View>
        </View>

        {shelfOpen && swappable && !onPrimarySwapAction ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shelf}
            contentContainerStyle={styles.shelfContent}
          >
            {swapOptions.map((opt) => {
              const selected = opt.id === li.itemId;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.shelfCard,
                    selected && styles.shelfCardSelected,
                    Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
                  ]}
                  onPress={() => {
                    onSwap(opt);
                    setShelfOpen(false);
                  }}
                >
                  <BoxItemImage size={48} imageUrl={opt.imageUrl} itemId={opt.id} />
                  <Text style={styles.shelfName} numberOfLines={2}>
                    {opt.name}
                  </Text>
                  {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {!onOpenProduct ? (
          <ItemDetailSheet
            visible={detailOpen}
            item={item}
            lineItem={li}
            onClose={() => setDetailOpen(false)}
            onSwap={
              swappable
                ? () => {
                    setDetailOpen(false);
                    if (onPrimarySwapAction) {
                      onPrimarySwapAction();
                      return;
                    }
                    setShelfOpen(true);
                  }
                : undefined
            }
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <View style={styles.row}>
        <TouchableOpacity style={styles.body} onPress={openDetail} activeOpacity={0.85}>
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
            <TouchableOpacity onPress={onPrimarySwapPress} style={styles.swapBtn}>
              <Text style={styles.swapText}>
                {onPrimarySwapAction ? primarySwapLabel : shelfOpen ? 'Close' : primarySwapLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {showWrapControls && !locked ? (
            <TouchableOpacity onPress={onToggleSurprise} style={styles.surpriseBtn}>
              <Text style={styles.surpriseBtnText}>
                {isSurprise ? 'Wrapped ✓' : 'Wrap as surprise'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {onQuantityChange && !locked ? (
        <View style={styles.defaultQtyWrap}>
          <QtyStepper
            quantity={quantity}
            locked={locked}
            decrementMode={resolvedDecrement}
            onQuantityChange={onQuantityChange}
            styles={styles}
            colors={colors}
          />
        </View>
      ) : showAddAnother && onAddAnother && !locked ? (
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

      {shelfOpen && swappable && !onPrimarySwapAction ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.shelf}
          contentContainerStyle={styles.shelfContent}
        >
          {swapOptions.map((opt) => {
            const selected = opt.id === li.itemId;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.shelfCard,
                  selected && styles.shelfCardSelected,
                  Platform.OS === 'web' ? { boxShadow: shadowsWeb.sm } : undefined,
                ]}
                onPress={() => {
                  onSwap(opt);
                  setShelfOpen(false);
                }}
              >
                <BoxItemImage size={48} imageUrl={opt.imageUrl} itemId={opt.id} />
                <Text style={styles.shelfName} numberOfLines={2}>
                  {opt.name}
                </Text>
                {selected ? <Text style={styles.selectedMark}>✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {!onOpenProduct ? (
        <ItemDetailSheet
          visible={detailOpen}
          item={item}
          lineItem={li}
          onClose={() => setDetailOpen(false)}
          onSwap={
            swappable
              ? () => {
                  setDetailOpen(false);
                  if (onPrimarySwapAction) {
                    onPrimarySwapAction();
                    return;
                  }
                  setShelfOpen(true);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function createBoxItemRowStyles(colors: SemanticColors) {
  return StyleSheet.create({
    cardRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch', width: '100%' },
    cardImageWrap: {
      width: 112,
      minHeight: 112,
      maxHeight: 130,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      flexShrink: 0,
    },
    cardImage: { width: '100%', height: '100%', borderRadius: borderRadius.md },
    cardBody: { flex: 1, justifyContent: 'space-between', gap: 4 },
    /** Desktop web — image on top, copy below; sits in a side-by-side grid. */
    tileCard: {
      flexDirection: 'column',
      gap: spacing.sm,
      width: '100%',
      alignItems: 'stretch',
    },
    tileImageWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: borderRadius.xxl,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
    },
    tileImage: { width: '100%', height: '100%', borderRadius: borderRadius.xxl },
    tileBody: { width: '100%', gap: 4 },
    cardTop: { gap: 4 },
    cardTag: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      ...typeface('regular'),
      letterSpacing: -0.33,
    },
    cardName: {
      fontSize: typography.xxl,
      color: colors.textPrimary,
      ...typeface('regular'),
      letterSpacing: -0.26,
    },
    cardDesc: {
      fontSize: typography.sm,
      color: colors.textPrimary,
      lineHeight: 16.5,
      ...typeface('light'),
      letterSpacing: -0.33,
    },
    cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
    /** Match qty stepper pill height (~27px). */
    chip: {
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
      borderRadius: borderRadius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 0,
      minHeight: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgPrimary,
    },
    chipPrimary: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    chipDisabled: { opacity: 0.6 },
    chipText: {
      fontSize: 9,
      color: colors.goldMuted,
      ...typeface('regular'),
      letterSpacing: -0.18,
      textTransform: 'lowercase',
    },
    chipTextPrimary: { color: colors.goldMuted },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 0.5,
      borderColor: colors.goldMuted,
      borderRadius: borderRadius.pill,
      paddingHorizontal: 4,
      paddingVertical: 0,
      minHeight: 27,
      backgroundColor: colors.bgPrimary,
    },
    qtyBtn: {
      minWidth: 22,
      minHeight: 27,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    qtyBtnDonate: { minWidth: 44 },
    qtyBtnText: {
      fontSize: 12,
      color: colors.goldMuted,
      ...typeface('regular'),
      lineHeight: 14,
    },
    qtyBtnTextDonate: { fontSize: 9, letterSpacing: -0.18, textTransform: 'lowercase' },
    qtyValue: {
      fontSize: 11,
      color: colors.textPrimary,
      ...typeface('medium'),
      minWidth: 14,
      textAlign: 'center',
    },
    qtyReadonly: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      ...typeface('regular'),
    },
    defaultQtyWrap: { paddingLeft: 64, marginBottom: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    body: { flex: 1, flexDirection: 'row', gap: spacing.sm },
    text: { flex: 1 },
    name: { fontWeight: '600', fontSize: typography.lg },
    meta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 2 },
    badges: { marginTop: 4, gap: 2 },
    badge: { fontSize: typography.sm, color: colors.textTertiary },
    surpriseBadge: { fontSize: typography.sm, color: colors.brand, fontWeight: '600' },
    price: { fontSize: typography.md, fontWeight: '600', marginTop: 4 },
    actions: { alignItems: 'flex-end', gap: spacing.xs },
    swapBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
    swapText: { color: colors.brand, fontWeight: '600' },
    surpriseBtn: { paddingHorizontal: spacing.xs },
    surpriseBtnText: { fontSize: typography.sm, color: colors.textSecondary },
    keepRow: { flexDirection: 'row', gap: spacing.xs, paddingLeft: 64, marginBottom: spacing.xs },
    keepBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    keepBtnOn: { borderColor: colors.brand, backgroundColor: colors.brandLight },
    keepText: { fontSize: typography.sm, color: colors.textSecondary },
    addAnother: { paddingVertical: spacing.xs, paddingLeft: 64 },
    addAnotherText: { color: colors.brand, fontWeight: '600', fontSize: typography.sm },
    shelf: { marginBottom: spacing.sm },
    shelfContent: { gap: spacing.sm, paddingVertical: spacing.sm },
    shelfCard: {
      width: 100,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: colors.bgPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    shelfCardSelected: { borderColor: colors.goldMuted, backgroundColor: colors.accentCream },
    shelfName: { fontSize: typography.sm, textAlign: 'center', marginTop: 4 },
    selectedMark: { color: colors.brand, fontWeight: '700', marginTop: 2 },
  });
}
