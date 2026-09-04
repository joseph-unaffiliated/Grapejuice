import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import {
  GiftFromOtherGiftsRail,
  type FromOtherGiftTile,
} from '../../components/gift/GiftFromOtherGiftsRail';
import { useCatalog } from '../../hooks/useCatalog';
import { useReceivedGifts } from '../../hooks/useReceivedGifts';
import { useSession } from '../../hooks/useSession';
import { useWebLayout } from '../../hooks/useWebLayout';
import {
  acceptReceivedGiftBox,
  updateReceivedGiftLineItems,
} from '../../services/gift/giftFlow';
import {
  collectFromOtherGifts,
  giftTransferLine,
} from '../../services/gift/fromOtherGifts';
import { formatDollars, chargeableLineTotal, catalogSlotId } from '../../services/box/buildDefaultBox';
import {
  boxAddOnUnitCents,
  resolveGiftPrepaidAddOnCents,
  recipientGiftUpgradeCents,
  SHIPPING_FLAT_CENTS,
} from '../../services/box/pricing';
import { resolveSwapOptionsForItem } from '../../services/box/sectionUpsells';
import { isWrapControlSlot } from '../../components/box/boxLineDisplay';
import type { MainStackParamList } from '../../navigation/types';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type Route = RouteProp<MainStackParamList, 'GiftBox'>;
type Nav = StackNavigationProp<MainStackParamList>;

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function slotIdAfterSwap(currentSlotId: string, newItem: CatalogItem): string {
  if (isWrapControlSlot(currentSlotId)) {
    const next =
      newItem.defaultSlot?.trim() ||
      catalogSlotId(newItem.slotId) ||
      newItem.slotId ||
      currentSlotId;
    return next;
  }
  return currentSlotId;
}

function GiftBoxBody() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { giftInviteId } = route.params;
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const { household, refresh: refreshSession } = useSession();
  const { gifts, loading: giftsLoading, refresh } = useReceivedGifts();
  const { items: catalog, loading: catalogLoading } = useCatalog();

  const gift = gifts.find((g) => g.giftInviteId === giftInviteId);
  const [lineItems, setLineItems] = useState<BoxLineItem[]>([]);
  const [prepaidAddOnCents, setPrepaidAddOnCents] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!gift || hydrated) return;
    setLineItems(gift.lineItems ?? []);
    setPrepaidAddOnCents(resolveGiftPrepaidAddOnCents(gift));
    setHydrated(true);
  }, [gift, hydrated]);

  const catalogById = useMemo(() => {
    const map = new Map(catalog.map((c) => [c.id, c]));
    return map;
  }, [catalog]);

  const otherTiles = useMemo(() => {
    if (!gift) return [];
    const ids = lineItems.map((li) => li.itemId);
    return collectFromOtherGifts(ids, gift.giftInviteId, gifts, catalogById).map((row) => ({
      item: row.item,
      fromGiverName: row.fromGiverName,
    }));
  }, [gift, gifts, catalogById, lineItems]);

  const swapOptionsBySlot = useMemo(() => {
    if (!catalog.length || !lineItems.length) return {} as Record<string, CatalogItem[]>;
    const next: Record<string, CatalogItem[]> = {};
    for (const li of lineItems) {
      const current = catalogById.get(li.itemId);
      next[li.slotId] = current ? resolveSwapOptionsForItem(current, catalog, 6) : [];
    }
    return next;
  }, [lineItems, catalog, catalogById]);

  const addOnValueCents = chargeableLineTotal(lineItems);
  const upgradeCents = recipientGiftUpgradeCents(lineItems, prepaidAddOnCents);
  const taxCents = Math.round((upgradeCents + SHIPPING_FLAT_CENTS) * 0.075);
  const preCredit = upgradeCents + SHIPPING_FLAT_CENTS + taxCents;
  const giftCredit = household?.giftCreditCents ?? 0;
  const creditApplied = Math.min(giftCredit, preCredit);
  const dueNow = Math.max(0, preCredit - creditApplied);

  const persist = useCallback(
    async (next: BoxLineItem[]) => {
      setSaving(true);
      try {
        await updateReceivedGiftLineItems(giftInviteId, next);
        await refresh();
      } catch (e) {
        notify('Could not save', e instanceof Error ? e.message : 'Try again.');
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [giftInviteId, refresh]
  );

  const setAndSave = async (next: BoxLineItem[]) => {
    setLineItems(next);
    try {
      await persist(next);
    } catch {
      // Revert on failure after refresh.
      await refresh();
      setHydrated(false);
    }
  };

  const onAddFromOther = async (tile: FromOtherGiftTile) => {
    if (lineItems.some((li) => li.itemId === tile.item.id)) return;
    const line = giftTransferLine(tile.item);
    await setAndSave([...lineItems, line]);
  };

  const onSwap = async (slotId: string, newItem: CatalogItem) => {
    const nextUnit = boxAddOnUnitCents(newItem);
    const next = lineItems.map((li) =>
      li.slotId === slotId
        ? {
            ...li,
            slotId: slotIdAfterSwap(li.slotId, newItem),
            itemId: newItem.id,
            unitCents: nextUnit,
            label: newItem.name,
          }
        : li
    );
    await setAndSave(next);
  };

  const onRemove = async (itemId: string) => {
    await setAndSave(lineItems.filter((li) => li.itemId !== itemId));
  };

  const goCheckout = () => {
    navigation.navigate('GiftBoxCheckout', { giftInviteId });
  };

  const confirmFree = async () => {
    setConfirming(true);
    try {
      await persist(lineItems);
      if (upgradeCents > 0) {
        goCheckout();
        return;
      }
      await acceptReceivedGiftBox(giftInviteId);
      await refreshSession({ silent: true });
      await refresh();
      navigation.replace('MyGifts');
    } catch (e) {
      notify('Could not confirm', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setConfirming(false);
    }
  };

  if (giftsLoading || catalogLoading || !hydrated) {
    return (
      <View style={styles.centered}>
        <BrandLoadingMark color={colors.brand} />
      </View>
    );
  }

  if (!gift || gift.kind !== 'box') {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Gift box not found.</Text>
        <TouchableOpacity onPress={() => navigation.replace('MyGifts')}>
          <Text style={styles.backLink}>Back to My Gifts</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (gift.status !== 'available') {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>
          This gift is no longer editable
          {gift.status === 'converted_to_credit' ? ' (converted to credit)' : ''}.
        </Text>
        <TouchableOpacity onPress={() => navigation.replace('MyGifts')}>
          <Text style={styles.backLink}>Back to My Gifts</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ctaLabel =
    upgradeCents > 0
      ? dueNow > 0
        ? `Continue to payment · ${formatDollars(dueNow)}`
        : `Confirm with credit · ${formatDollars(preCredit)}`
      : 'Confirm gift box';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.navigate('MyGifts')} style={styles.backRow}>
        <Text style={styles.backLink}>← My Gifts</Text>
      </TouchableOpacity>

      <Text style={styles.kicker}>Gift from {gift.giverName || 'someone special'}</Text>
      <Text style={styles.title}>Your gift box</Text>
      <Text style={styles.subtitle}>
        Swap freely within what they already paid for. You only owe the difference if you upgrade
        beyond that — gift credit can cover it.
      </Text>

      {saving ? (
        <View style={styles.savingRow}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.savingText}>Saving…</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {lineItems.map((li) => {
          const catalogItem = catalogById.get(li.itemId);
          return (
            <BoxItemRow
              key={`${li.slotId}-${li.itemId}`}
              li={li}
              item={catalogItem}
              locked={false}
              swapOptions={swapOptionsBySlot[li.slotId] ?? []}
              onSwap={(opt) => void onSwap(li.slotId, opt)}
              formatPrice={formatDollars}
              showPrice={false}
              meta={li.unitCents > 0 ? `${formatDollars(li.unitCents)} value` : 'Included in gift'}
              onRemove={() => void onRemove(li.itemId)}
              decrementMode={li.unitCents > 0 ? 'remove' : 'donate'}
            />
          );
        })}
      </View>

      <GiftFromOtherGiftsRail tiles={otherTiles} onAdd={(t) => void onAddFromOther(t)} />

      <View style={styles.summary}>
        {prepaidAddOnCents > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Covered by gift</Text>
            <Text style={styles.creditValue}>-{formatDollars(prepaidAddOnCents)}</Text>
          </View>
        ) : null}
        {addOnValueCents > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Add-on value</Text>
            <Text style={styles.summaryValue}>{formatDollars(addOnValueCents)}</Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Your upgrades</Text>
          <Text style={styles.summaryValue}>{formatDollars(upgradeCents)}</Text>
        </View>
        {creditApplied > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gift credit</Text>
            <Text style={styles.creditValue}>-{formatDollars(creditApplied)}</Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Due now</Text>
          <Text style={styles.totalValue}>{formatDollars(dueNow)}</Text>
        </View>
        <Text style={styles.creditHint}>
          Gift credit on hand: {formatDollars(giftCredit)}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.cta, confirming && styles.ctaDisabled]}
        onPress={() => void (upgradeCents > 0 ? goCheckout() : confirmFree())}
        disabled={confirming || saving || lineItems.length === 0}
      >
        {confirming ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

export function GiftBoxScreen() {
  const { isDesktop } = useWebLayout();
  return (
    <StorefrontChrome bodyMode="fill" hideServicesNav>
      <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
        <GiftBoxBody />
      </WebContentPanel>
    </StorefrontChrome>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingBottom: 120,
      maxWidth: isDesktop ? 640 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.md,
    },
    empty: { textAlign: 'center', color: colors.textSecondary, ...typeface('regular') },
    backRow: { marginBottom: spacing.sm },
    backLink: { color: colors.brand, fontWeight: '600', fontSize: typography.md },
    kicker: {
      fontSize: typography.sm,
      color: colors.goldMuted,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 4,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: typography.md,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    savingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    savingText: { fontSize: typography.sm, color: colors.textTertiary },
    list: { gap: spacing.sm, marginBottom: spacing.md },
    summary: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: colors.accentCream,
      gap: spacing.xs,
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryLabel: { fontSize: typography.md, color: colors.textSecondary },
    summaryValue: { fontSize: typography.md, color: colors.textPrimary, fontWeight: '600' },
    creditValue: { fontSize: typography.md, color: colors.brand, fontWeight: '600' },
    totalLabel: { fontSize: typography.lg, color: colors.textPrimary, fontWeight: '700' },
    totalValue: { fontSize: typography.lg, color: colors.textPrimary, fontWeight: '700' },
    creditHint: { fontSize: typography.sm, color: colors.textTertiary, marginTop: spacing.xs },
    cta: {
      marginTop: spacing.lg,
      backgroundColor: colors.textPrimary,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.pill,
      alignItems: 'center',
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: { color: colors.goldMuted, fontWeight: '700', fontSize: typography.lg },
  });
}
