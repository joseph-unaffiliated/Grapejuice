import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import type { RavPaneKind, RavPanePayload, RavTreatPathOption } from '../../types/ravPane';
import { isTreatPathAlreadyActive } from '../../services/rav/ravCompanionIntent';
import { BoxItemImage } from '../box/BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

/** Comfortable reading width for the companion drawer. */
export const RAV_COMPANION_PANE_WIDTH = 520;

type Props = {
  kind: RavPaneKind;
  title?: string;
  subtitle?: string;
  payload?: RavPanePayload;
  lineItems: BoxLineItem[];
  catalog: CatalogItem[];
  onClose: () => void;
  onConfirmReview?: () => void;
  onDismissReview?: () => void;
  onReviewAppliedDone?: () => void;
  reviewBusy?: boolean;
  onPickOption?: (itemId: string) => void;
  onPickTreatPath?: (path: RavTreatPathOption) => void;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Pane chrome + content only. Parent owns open/close animation and layout push.
 */
export function RavCompanionPane({
  kind,
  title,
  subtitle,
  payload,
  lineItems,
  catalog,
  onClose,
  onConfirmReview,
  onDismissReview,
  onReviewAppliedDone,
  reviewBusy = false,
  onPickOption,
  onPickTreatPath,
}: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const byId = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of catalog) map.set(item.id, item);
    return map;
  }, [catalog]);

  const reviewApplied = kind === 'swap_review' && payload?.reviewStatus === 'applied';

  const heading =
    title ??
    (kind === 'box'
      ? 'Your box'
      : kind === 'swap_review'
        ? reviewApplied
          ? 'Box updated'
          : 'Review changes'
        : kind === 'swap_pick'
          ? 'Options'
          : kind === 'curation'
            ? 'Picks for you'
            : 'Product');

  const sub =
    subtitle ??
    (kind === 'box'
      ? 'Live draft from your Hanukkah box'
      : kind === 'swap_review'
        ? reviewApplied
          ? 'Your swap is in your box.'
          : 'Confirm before updating your box'
        : kind === 'swap_pick'
          ? 'Tap an option to continue'
          : undefined);

  const proposals = payload?.proposals ?? [];
  const optionIds = payload?.optionItemIds ?? [];
  const treatPaths = payload?.treatPaths ?? [];
  const currentItemId = payload?.currentItemId;

  const resolveName = (itemId?: string) => {
    if (!itemId) return 'Item';
    const fromCatalog = byId.get(itemId)?.name;
    if (fromCatalog) return fromCatalog;
    const fromLine = lineItems.find((li) => li.itemId === itemId)?.label;
    if (fromLine) return fromLine;
    return itemId
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const removingItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const p of proposals) {
      if (p.actionType === 'remove' && p.fromItemId) ids.push(p.fromItemId);
      if (p.actionType === 'swap' && p.fromItemId) ids.push(p.fromItemId);
    }
    return [...new Set(ids)];
  }, [proposals]);

  const replacingItemIds = useMemo(() => {
    if (payload?.replacingWithItemIds?.length) {
      return [...new Set(payload.replacingWithItemIds)];
    }
    const ids: string[] = [];
    for (const p of proposals) {
      if ((p.actionType === 'swap' || p.actionType === 'add') && p.toItemId) {
        ids.push(p.toItemId);
      }
    }
    return [...new Set(ids)];
  }, [payload?.replacingWithItemIds, proposals]);

  const hasReviewContent = removingItemIds.length > 0 || replacingItemIds.length > 0;

  return (
    <View style={styles.pane}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{heading}</Text>
          {sub ? <Text style={styles.subtitle}>{sub}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityLabel="Close pane"
          hitSlop={8}
        >
          <Icon icon={icons.close} size={14} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {kind === 'box' ? (
          lineItems.length === 0 ? (
            <View style={styles.empty}>
              <Icon icon={icons.boxOpen} size={28} color={colors.goldMuted} />
              <Text style={styles.emptyTitle}>Box is empty</Text>
              <Text style={styles.emptyBody}>
                Add items from Browse or ask Rav to build a starter box — they&apos;ll show up here.
              </Text>
            </View>
          ) : (
            lineItems.map((li) => {
              const item = byId.get(li.itemId);
              const name = item?.name ?? li.label ?? li.itemId;
              const price = item?.dollarCostCents ?? li.unitCents;
              return (
                <View key={li.slotId} style={styles.row}>
                  <BoxItemImage
                    size={64}
                    imageUrl={item?.imageUrl}
                    itemId={item?.id ?? li.itemId}
                  />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {name}
                    </Text>
                    {typeof price === 'number' ? (
                      <Text style={styles.rowMeta}>{formatCents(price)}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )
        ) : kind === 'product_detail' && payload?.itemId ? (
          (() => {
            const item = byId.get(payload.itemId!);
            if (!item) {
              return (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Item unavailable</Text>
                  <Text style={styles.emptyBody}>That catalog item isn&apos;t loaded right now.</Text>
                </View>
              );
            }
            return (
              <View style={styles.pickCard}>
                <BoxItemImage size={96} imageUrl={item.imageUrl} itemId={item.id} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.rowMeta} numberOfLines={4}>
                      {item.description}
                    </Text>
                  ) : null}
                  {typeof item.dollarCostCents === 'number' ? (
                    <Text style={styles.rowMeta}>{formatCents(item.dollarCostCents)}</Text>
                  ) : null}
                </View>
              </View>
            );
          })()
        ) : kind === 'swap_pick' ? (
          payload?.pickMode === 'treat_path' && treatPaths.length > 0 ? (
            treatPaths.map((path) => {
              const kit = byId.get(path.kitItemId);
              const inBox = lineItems.some((li) => li.itemId === path.kitItemId);
              const alreadyActive = isTreatPathAlreadyActive(path, lineItems, catalog);
              const willRemove = path.removeSlotIds.length;
              return (
                <TouchableOpacity
                  key={path.id}
                  style={styles.pickCard}
                  onPress={() => onPickTreatPath?.(path)}
                  disabled={reviewBusy}
                  accessibilityLabel={`Choose ${path.label}`}
                >
                  <BoxItemImage
                    size={72}
                    imageUrl={kit?.imageUrl}
                    itemId={kit?.id ?? path.kitItemId}
                  />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{path.label}</Text>
                    {path.description ? (
                      <Text style={styles.rowMeta}>{path.description}</Text>
                    ) : null}
                    {inBox ? <Text style={styles.pickCurrent}>In your box</Text> : null}
                    {alreadyActive ? (
                      <Text style={styles.rowMeta}>Already your treat path</Text>
                    ) : willRemove > 0 ? (
                      <Text style={styles.rowMeta}>
                        Swaps out {willRemove} other treat item{willRemove === 1 ? '' : 's'}
                      </Text>
                    ) : (
                      <Text style={styles.rowMeta}>Adds this treat path to your box</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          ) : optionIds.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No options found</Text>
              <Text style={styles.emptyBody}>
                Nothing in the catalog matched this ask. Try Browse or My Box.
              </Text>
            </View>
          ) : (
            optionIds.map((id) => {
              const item = byId.get(id);
              const isCurrent = id === currentItemId;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.pickCard, isCurrent ? styles.pickCardCurrent : null]}
                  onPress={() => onPickOption?.(id)}
                  disabled={reviewBusy || isCurrent}
                  accessibilityLabel={item?.name ?? id}
                >
                  <BoxItemImage size={64} imageUrl={item?.imageUrl} itemId={item?.id ?? id} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item?.name ?? id}
                    </Text>
                    {typeof item?.dollarCostCents === 'number' ? (
                      <Text style={styles.rowMeta}>{formatCents(item.dollarCostCents)}</Text>
                    ) : null}
                    {isCurrent ? <Text style={styles.pickCurrent}>Currently in box</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )
        ) : kind === 'swap_review' ? (
          reviewApplied ? (
            <View style={styles.appliedBlock}>
              <Icon icon={icons.thumbsUp} size={28} color={colors.goldMuted} />
              <Text style={styles.emptyTitle}>Swap applied</Text>
              <Text style={styles.emptyBody}>
                Your box draft is updated. You can keep chatting with Rav or open your box anytime.
              </Text>
            </View>
          ) : !hasReviewContent ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing to review</Text>
              <Text style={styles.emptyBody}>Rav didn&apos;t return any box changes for this turn.</Text>
            </View>
          ) : (
            <>
              {removingItemIds.length > 0 ? (
                <View style={styles.proposalCard}>
                  <Text style={styles.summaryLead}>Will be removed from your box</Text>
                  <View style={styles.removeList}>
                    {removingItemIds.map((itemId) => {
                      const from = byId.get(itemId);
                      return (
                        <View key={`remove-${itemId}`} style={styles.removeRow}>
                          <BoxItemImage size={48} imageUrl={from?.imageUrl} itemId={from?.id ?? itemId} />
                          <Text style={styles.rowTitle} numberOfLines={2}>
                            {resolveName(itemId)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {replacingItemIds.length > 0 ? (
                <View style={styles.proposalCard}>
                  <Text style={styles.summaryLead}>Will be swapped with</Text>
                  <View style={styles.removeList}>
                    {replacingItemIds.map((itemId) => {
                      const to = byId.get(itemId);
                      return (
                        <View key={`replace-${itemId}`} style={styles.removeRow}>
                          <BoxItemImage size={48} imageUrl={to?.imageUrl} itemId={to?.id ?? itemId} />
                          <Text style={styles.rowTitle} numberOfLines={2}>
                            {resolveName(itemId)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </>
          )
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{heading}</Text>
            <Text style={styles.emptyBody}>
              Placeholder for the {kind.replace('_', ' ')} flow.
            </Text>
          </View>
        )}
      </ScrollView>

      {kind === 'swap_review' && reviewApplied ? (
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.footerBtnPrimary}
            onPress={onReviewAppliedDone ?? onClose}
            accessibilityLabel="Done"
          >
            <Text style={styles.footerBtnPrimaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : kind === 'swap_review' && hasReviewContent ? (
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.footerBtnSecondary}
            onPress={onDismissReview ?? onClose}
            disabled={reviewBusy}
            accessibilityLabel="Dismiss changes"
          >
            <Text style={styles.footerBtnSecondaryText}>Dismiss</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtnPrimary, reviewBusy ? styles.footerBtnDisabled : null]}
            onPress={onConfirmReview}
            disabled={reviewBusy || !onConfirmReview}
            accessibilityLabel="Apply changes"
          >
            <Text style={styles.footerBtnPrimaryText}>
              {reviewBusy ? 'Applying…' : 'Apply'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    pane: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.bgPrimary,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
      paddingRight: spacing.sm,
    },
    title: {
      fontSize: typography.xl,
      color: colors.textPrimary,
      letterSpacing: -0.4,
      ...typeface('medium'),
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      lineHeight: typography.sm * 1.4,
      ...typeface('regular'),
    },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.pill,
      backgroundColor: colors.bgElevated,
      flexShrink: 0,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    rowTitle: {
      fontSize: typography.md,
      color: colors.textPrimary,
      lineHeight: typography.md * 1.35,
      ...typeface('regular'),
    },
    rowMeta: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      ...typeface('regular'),
    },
    proposalCard: {
      gap: spacing.sm,
      paddingBottom: spacing.md,
      marginBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    summaryLead: {
      fontSize: typography.md,
      color: colors.textPrimary,
      lineHeight: typography.md * 1.4,
      ...typeface('regular'),
    },
    removeList: {
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    removeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    proposalInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    proposalBadge: {
      fontSize: typography.xs,
      color: colors.goldMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      ...typeface('medium'),
    },
    proposalSwapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    proposalSide: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      gap: spacing.xs,
    },
    proposalArrow: {
      fontSize: typography.lg,
      color: colors.textSecondary,
      ...typeface('regular'),
    },
    proposalName: {
      fontSize: typography.sm,
      color: colors.textPrimary,
      textAlign: 'center',
      ...typeface('regular'),
    },
    proposalReason: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      ...typeface('light'),
    },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    appliedBlock: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    emptyTitle: {
      fontSize: typography.lg,
      color: colors.textPrimary,
      textAlign: 'center',
      ...typeface('medium'),
    },
    emptyBody: {
      fontSize: typography.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: typography.sm * 1.45,
      maxWidth: 280,
      ...typeface('regular'),
    },
    footerActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footerBtnSecondary: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    footerBtnSecondaryText: {
      fontSize: typography.md,
      color: colors.textPrimary,
      ...typeface('regular'),
    },
    footerBtnPrimary: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.pill,
      backgroundColor: colors.textPrimary,
    },
    footerBtnDisabled: { opacity: 0.5 },
    footerBtnPrimaryText: {
      fontSize: typography.md,
      color: colors.bgPrimary,
      ...typeface('medium'),
    },
    pickCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    pickCardCurrent: {
      opacity: 0.7,
    },
    pickCurrent: {
      fontSize: typography.xs,
      color: colors.brand,
      ...typeface('medium'),
    },
  });
}
