import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { BoxLineItem, CatalogItem, ChildProfile } from '../../types/pilot';
import { BoxItemImage } from './BoxItemImage';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  formatPresentAttribution,
  wrapControlLines,
  wrappableLinesInBox,
  type CoalescedBoxLine,
} from './boxLineDisplay';
import { catalogSlotId, formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveByDefaultSlot, WRAP_POLICY } from '../../services/box/boxRules';
import { EXTRA_FLAT_CENTS, resolveCatalogDisplayPrices } from '../../services/box/pricing';
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

/** True when the box wrap-control SKU is pre-wrap (vs wrapping paper). */
function isPreWrapSelected(lineItems: BoxLineItem[], catalog: CatalogItem[]): boolean {
  const wrap = wrapControlLines(lineItems)[0];
  if (!wrap) return false;
  const base = catalogSlotId(wrap.slotId);
  if (base === 'pre-wrap') return true;
  if (base === 'wrapping-paper' || base === 'wrapping') return false;
  const item = catalog.find((c) => c.id === wrap.itemId);
  return (
    catalogSlotId(item?.slotId ?? '') === 'pre-wrap' ||
    item?.defaultSlot === 'pre-wrap' ||
    /pre.?wrap/i.test(`${wrap.itemId} ${wrap.label ?? ''} ${item?.name ?? ''}`)
  );
}

/**
 * Wrapping-paper member/add-on cents for “To be wrapped (+$N)” copy.
 * Prefers catalog wrapping-paper memberPriceCents; else wrap line unitCents; else EXTRA_FLAT.
 */
function wrappingPaperAddonCents(lineItems: BoxLineItem[], catalog: CatalogItem[]): number {
  const row = resolveByDefaultSlot(catalog, WRAP_POLICY.defaultSlot);
  const paper =
    (row ? catalog.find((c) => c.id === row.id) : undefined) ??
    catalog.find(
      (c) =>
        catalogSlotId(c.slotId) === 'wrapping-paper' ||
        c.defaultSlot === 'wrapping-paper' ||
        /wrapping.?paper/i.test(`${c.id} ${c.name}`)
    );
  if (paper) {
    const { memberCents } = resolveCatalogDisplayPrices(paper);
    if (memberCents > 0) return memberCents;
  }
  const wrap = wrapControlLines(lineItems)[0];
  if (wrap && wrap.unitCents > 0) return wrap.unitCents;
  return EXTRA_FLAT_CENTS;
}

function toBeWrappedHeading(lineItems: BoxLineItem[], catalog: CatalogItem[]): string {
  if (isPreWrapSelected(lineItems, catalog)) return 'To be wrapped (Included)';
  const cents = wrappingPaperAddonCents(lineItems, catalog);
  return `To be wrapped (+${formatCatalogDollars(cents)})`;
}

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

  const toWrapHeading = useMemo(
    () => toBeWrappedHeading(lineItems, catalog),
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
          <Text style={styles.heading}>{toWrapHeading}</Text>
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
      textAlign: 'center',
    },
    empty: {
      fontSize: typography.sm,
      ...typeface('light'),
      color: colors.textSecondary,
      lineHeight: 18,
      textAlign: 'center',
    },
    list: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
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
