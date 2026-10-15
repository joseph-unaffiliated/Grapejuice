import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { Icon } from '../../components/ui/Icon';
import { DreidelIcon } from '../../components/ui/DreidelIcon';
import { icons } from '../../constants/icons';
import { BOX_DISPLAY_SECTIONS, displaySectionForCatalogItem, displaySectionForLineItem, type BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import { openIcs } from '../../components/holiday/AddToCalendarMenu';
import { hanukkahCalendarEvents } from '../../utils/calendarLinks';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  resolveBoxItemAttributionKind,
  isWrapControlSlot,
  isWrappingPaperItem,
  isGiftSlotLine,
  includedPracticeSlotVacant,
  openKidSlotFor,
  wrappableLinesInBox,
  type CoalescedBoxLine,
} from '../../components/box/boxLineDisplay';
import { findSwapSourceLine } from '../../services/box/findSwapSourceLine';
import { isPilotLine, PILOT_PICK_META } from '../../services/box/pilotLines';
import { ProductNote } from '../../components/box/ProductNote';
import { PilotReturnBanner } from '../../components/pilot/PilotReturnBanner';
import { formatCatalogDollars, toRulesRow } from '../../services/box/buildDefaultBox';
import { isLowWithDrafts, resolveByDefaultSlot } from '../../services/box/boxRules';
import { isStorefrontRavOpenable, openStorefrontRav } from '../../components/storefront/storefrontRavContext';
import { kidPlannerAges, storySwapShelf } from '../../services/box/sectionUpsells';
import { isIncludedSwap } from '../../services/box/swapPricing';
import { HorizontalDragScrollView } from '../../components/home/HorizontalDragScrollView';
import { chargeableLineTotal, resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
import { useSession } from '../../hooks/useSession';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { abandonOwnBox, startOwnBoxBuild } from '../../navigation/boxEntry';
import { navigateMainStack } from '../../navigation/mainStackNavigation';
import { getStripePromise, prefetchSetupIntent } from '../../services/checkout/checkoutPrefetch';
import type { MainStackParamList } from '../../navigation/types';
import type { useMyBoxEditing } from '../../hooks/useMyBoxEditing';
import { NOT_HELD_COPY, daysUntilLock, lockShortLabel } from '../../hooks/useBoxGlance';
import { BoxSummary, type BoxThumb } from '../../components/mobile/BoxSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { MobileToast, type ToastState } from '../../components/mobile/MobileToast';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { ProductTileMobile } from '../../components/mobile/ProductTileMobile';
import { primaryPhoto } from '../../components/mobile/catalogPhotos';
import { balanceProps, m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';

/** The slice of useMyBoxEditing the phone box uses; the gift flow supplies the same shape. */
export type MobileBoxEditing = Pick<
  ReturnType<typeof useMyBoxEditing>,
  | 'locked' | 'lineItems' | 'donatedItems' | 'upsellsBySection' | 'applySwap' | 'openOrder' | 'grouped' | 'catalog'
  | 'boxPriceCents' | 'restoreDonated' | 'lockAt' | 'goToCheckout' | 'children' | 'swapOptionsBySlot' | 'savingOrder'
  | 'modalRemoveFromBox' | 'donatedLineSnapshots' | 'cardOnFile' | 'swapToPreWrap' | 'swapEligibleIdsBySection' | 'startsOn'
  | 'setProductModalSection' | 'saveOrderUpdates' | 'ordersLoading' | 'modalAddToBox' | 'hasSessionEdits' | 'guestViewOnly'
  | 'freeAddOptionsBySection' | 'estimatedDeliveryBy' | 'changeBoxQuantity' | 'addFreeItemToEmptySlot' | 'geltCeiling'
  | 'addOnTopCents'
> &
  /** Choosing which presents come wrapped after pre-wrap; the gift flow omits these. */
  Partial<Pick<ReturnType<typeof useMyBoxEditing>, 'wrapSelectedIds' | 'persistWrapSelection' | 'swapBackToPaper'>>;

/** Gift flow: their box under a task header, "Send by", and Next instead of Checkout. */
export type MobileBoxGiftMode = {
  header: React.ReactNode;
  banner: string;
  nextLabel: string;
  onNext: () => void;
};

type Props = {
  editing: MobileBoxEditing;
  navigation: StackNavigationProp<MainStackParamList>;
  gift?: MobileBoxGiftMode;
};

type Sheet =
  | { kind: 'tradition'; sectionId: BoxDisplaySectionId }
  | { kind: 'product'; item: CatalogItem; group: CoalescedBoxLine | null; sectionId: BoxDisplaySectionId }
  | { kind: 'receipt'; donatedOpen?: boolean }
  | null;

const SECTION_ICON: Record<Exclude<BoxDisplaySectionId, 'dreidel'>, (typeof icons)[keyof typeof icons]> = {
  candles: icons.menorah,
  food: icons.utensils,
  story: icons.book,
  presents: icons.gift,
};

function SectionIcon({ id, size, color }: { id: BoxDisplaySectionId; size: number; color: string }) {
  return id === 'dreidel' ? <DreidelIcon size={size} color={color} /> : <Icon icon={SECTION_ICON[id]} size={size} color={color} />;
}

const SHORT: Record<BoxDisplaySectionId, string> = { candles: 'Candles', dreidel: 'Dreidel', food: 'Eat', story: 'Story', presents: 'Gifts' };
const BROWSE_AISLE: Record<BoxDisplaySectionId, { slug: string; label: string }> = {
  story: { slug: 'books', label: 'Browse all books' },
  candles: { slug: 'candles', label: 'Browse all candles' },
  dreidel: { slug: 'dreidels', label: 'Browse all dreidels' },
  food: { slug: 'food', label: 'Browse all food' },
  presents: { slug: 'toys', label: 'Browse all gifts' },
};

/**
 * My Box for the phone (mockups box-v3.html), on the same useMyBoxEditing hook as
 * desktop. Title and lock line, the small box summary, the not-held line, tradition
 * chips, one section per tradition with whole-row taps, the might-like shelf, and the
 * white sticky bar. Sheets: tradition (pick, alternatives, add-ons), product card,
 * receipt, donated items.
 */
export function MyBoxMobile({ editing: e, navigation, gift }: Props) {
  const yours = gift ? 'their' : 'your';
  /** Toast actions outlive the render that created them. */
  const live = useRef(e);
  live.current = e;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [active, setActive] = useState<BoxDisplaySectionId>('candles');
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<BoxDisplaySectionId, number>>>({});
  const byId = useMemo(() => new Map(e.catalog.map((c) => [c.id, c])), [e.catalog]);
  const focusItemId = useGuestSessionStore((s) => s.myBoxFocusItemId);
  const clearFocusItem = useGuestSessionStore((s) => s.setMyBoxFocusItemId);
  const kids = e.children;
  const geltCeiling = e.geltCeiling;
  const { household, refresh } = useSession();

  const checkoutReady = !!household?.id && !e.guestViewOnly && !e.openOrder && !e.ordersLoading && !e.locked && e.lineItems.length > 0;
  const needsCard = checkoutReady && !e.cardOnFile;
  useEffect(() => {
    if (Platform.OS !== 'web' || !needsCard || !household?.id) return;
    const key = (Constants.expoConfig?.extra as Record<string, string | undefined> | undefined)?.stripePublishableKey ?? '';
    if (!key) return;
    void getStripePromise(key)?.catch(() => undefined);
    prefetchSetupIntent(household.id);
  }, [needsCard, household?.id]);
  const kidName = (id?: string | null) => {
    if (!id) return null;
    const i = kids.findIndex((c) => c.id === id);
    return kids[i]?.name?.trim() || (gift ? (kids.length > 1 ? `kid ${i + 1}` : 'their kid') : 'your kid');
  };

  const extras = chargeableLineTotal(e.lineItems);
  const total = e.boxPriceCents + extras;
  const lockShort = lockShortLabel(e.lockAt);
  const daysLeft = daysUntilLock(e.lockAt);
  const donatedValue = e.donatedItems.reduce((t, d) => t + resolveCatalogDisplayPrices(d.item).memberCents * d.missing, 0);

  /** Each kid's present sits under Gifts on the phone, whatever kind of thing it is. */
  const rowsFor = useCallback(
    (sectionId: BoxDisplaySectionId) => {
      const isKidGift = (l: { slotId: string; childId?: string | null }) => isGiftSlotLine(l as never) && !!l.childId;
      if (sectionId !== 'presents') return coalesceLinesByItemId((e.grouped[sectionId] ?? []).filter((l) => !isKidGift(l)));
      const gifts = BOX_DISPLAY_SECTIONS.flatMap((s) => (e.grouped[s.id] ?? []).filter(isKidGift));
      return coalesceLinesByItemId([...gifts, ...fullCardLinesForSection('presents', e.grouped.presents ?? [])]);
    },
    [e.grouped]
  );
  const openProductSheet = useCallback(
    (item: CatalogItem) => {
      for (const s of BOX_DISPLAY_SECTIONS) {
        const group = rowsFor(s.id).find((row) => row.itemId === item.id);
        if (group) {
          setSheet({ kind: 'product', item, group, sectionId: s.id });
          return;
        }
      }
      setSheet({ kind: 'product', item, group: null, sectionId: displaySectionForCatalogItem(item) });
    },
    [rowsFor]
  );
  useEffect(() => {
    if (!focusItemId || !e.lineItems.length) return;
    const item = byId.get(focusItemId);
    if (!item) return;
    openProductSheet(item);
    clearFocusItem(null);
  }, [focusItemId, e.lineItems.length, byId, openProductSheet, clearFocusItem]);
  /** Fully donated items keep a faded row in their section; partly donated ones note it on the live row. */
  const donatedBySection = useMemo(() => {
    const out: Partial<Record<BoxDisplaySectionId, { item: CatalogItem; missing: number }[]>> = {};
    for (const d of e.donatedItems) {
      const snap = e.donatedLineSnapshots.current.get(d.item.id)?.[0];
      const sectionId: BoxDisplaySectionId = snap ? (isGiftSlotLine(snap as never) && snap.childId ? 'presents' : displaySectionForLineItem(snap, d.item)) : displaySectionForCatalogItem(d.item);
      (out[sectionId] ??= []).push(d);
    }
    return out;
  }, [e.donatedItems, e.donatedLineSnapshots]);
  const donatedQty = useMemo(() => new Map(e.donatedItems.map((d) => [d.item.id, d.missing])), [e.donatedItems]);
  const sectionTitle = (id: BoxDisplaySectionId, fallback: string) =>
    id === 'food' ? 'Eat & Drink' : id === 'presents' ? 'Giving Gifts' : fallback;
  const addToCalendar = () => {
    const events = hanukkahCalendarEvents({ startsOn: e.startsOn ?? null, lockAt: e.lockAt ?? null, estimatedDeliveryBy: e.estimatedDeliveryBy ?? null });
    const lock = events.find((ev) => /customize|lock/i.test(ev.title)) ?? events[0];
    if (lock) openIcs(lock);
  };

  const thumbs: BoxThumb[] = useMemo(() => {
    const out: BoxThumb[] = [];
    for (const s of BOX_DISPLAY_SECTIONS) {
      for (const g of rowsFor(s.id)) {
        const item = byId.get(g.itemId);
        out.push({
          id: `${s.id}:${g.itemId}`,
          imageUrl: primaryPhoto(item),
          count: g.quantity > 1 ? g.quantity : undefined,
          onPress: () => setSheet(item ? { kind: 'product', item, group: g, sectionId: s.id } : { kind: 'tradition', sectionId: s.id }),
        });
      }
    }
    return out;
  }, [rowsFor, byId]);
  const thingCount = thumbs.length;

  /** Box items close to selling out, counting other unsecured drafts. Secured boxes already hold theirs. */
  const lowStockNames = useMemo(() => {
    if (gift || e.openOrder || e.locked || e.guestViewOnly) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const l of e.lineItems) {
      if (seen.has(l.itemId)) continue;
      seen.add(l.itemId);
      const item = byId.get(l.itemId);
      if (item && isLowWithDrafts(toRulesRow(item))) names.push(item.name);
    }
    return names;
  }, [gift, e.openOrder, e.locked, e.guestViewOnly, e.lineItems, byId]);
  const talkToRav = () => {
    const message = "I'd like to talk over my box";
    if (isStorefrontRavOpenable()) return openStorefrontRav(message);
    navigation.navigate('MainTabs', { screen: 'Rav', params: { newChat: true, initialMessage: message } });
  };

  const jumpTo = (id: BoxDisplaySectionId) => {
    const y = sectionY.current[id];
    if (y == null) return;
    setActive(id);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 64), animated: true });
  };
  const onScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = ev.nativeEvent.contentOffset.y + 120;
    let current: BoxDisplaySectionId = 'candles';
    for (const s of BOX_DISPLAY_SECTIONS) {
      const top = sectionY.current[s.id];
      if (top != null && top <= y) current = s.id;
    }
    if (current !== active) setActive(current);
  };

  const metaFor = (g: CoalescedBoxLine, item: CatalogItem | undefined) =>
    g.lines.some(isPilotLine) ? PILOT_PICK_META : formatBoxItemStatusMeta(
      g.unitCents,
      childNamesForLines(g.lines, kids),
      formatCatalogDollars,
      item ? resolveCatalogDisplayPrices(item).memberCents : 0,
      resolveBoxItemAttributionKind(g.lines, item),
      g.quantity,
      g.includedQuantity
    );

  const quantity = (g: CoalescedBoxLine, delta: 1 | -1, _sectionId: BoxDisplaySectionId) => {
    const item = byId.get(g.itemId);
    const removingIncluded = delta === -1 && g.quantity <= 1 && g.unitCents === 0 && !!item;
    void (async () => {
      const result = await e.changeBoxQuantity(g, delta, displaySectionForLineItem(g.primary, item));
      if (!removingIncluded || !item) return;
      if (result?.promotedItemId) {
        const promoted = byId.get(result.promotedItemId);
        setToast({
          message: `${promoted?.name ?? 'The other one'} is included now`,
          action: { label: 'Undo', onPress: () => void live.current.restoreDonated(item.id) },
        });
        return;
      }
      setToast({ message: `${item.name} donated to a family who couldn't otherwise celebrate`, action: { label: 'Undo', onPress: () => void live.current.restoreDonated(item.id) } });
    })();
  };

  /** A donated included item whose slot `item` can fill for free, e.g. cookie cutters in place of a donated Sufganiyot kit. */
  const donatedStandIn = (item: CatalogItem) => {
    const home = displaySectionForCatalogItem(item);
    return e.donatedItems.find(({ item: gone }) => {
      if (gone.id === item.id) return false;
      const snap = e.donatedLineSnapshots.current.get(gone.id)?.[0];
      const line = snap ? { ...snap, unitCents: 0 } : { slotId: '', itemId: gone.id, unitCents: 0 };
      if (!snap && displaySectionForCatalogItem(gone) !== home) return false;
      return isIncludedSwap(line, gone, item, { catalog: e.catalog, geltCeiling: e.geltCeiling });
    })?.item;
  };

  /**
   * A book (or any included-policy item) is free only while its slot is empty — for books and
   * presents, while some kid has none. Otherwise it swaps the one you have, or it costs the add-on price.
   */
  const offerFor = (item: CatalogItem, sectionId: BoxDisplaySectionId, sectionRows: CoalescedBoxLine[]) => {
    const slotOpen = sectionRows.length === 0 || includedPracticeSlotVacant(sectionId, e.lineItems);
    const kidSlotOpen = !!openKidSlotFor(item, sectionId, e.lineItems, kids.map((c) => c.id), e.catalog);
    const claimsSlot =
      kidSlotOpen ||
      !!donatedStandIn(item) ||
      (slotOpen && (e.freeAddOptionsBySection[sectionId] ?? []).some((i) => i.id === item.id));
    const cents = claimsSlot ? 0 : e.addOnTopCents(item, sectionId);
    const free = cents === 0;
    const swap = !free && (e.swapEligibleIdsBySection[sectionId]?.has(item.id) ?? false);
    const label = free ? 'Add · included' : swap ? 'Swap' : `Add · +${formatCatalogDollars(cents)}`;
    return { free, claimsSlot, swap, label, cents };
  };

  /** The aisle an item belongs in; only presents takes whatever section the button was in. */
  const homeSection = (item: CatalogItem, sectionId: BoxDisplaySectionId) => {
    const home = displaySectionForCatalogItem(item);
    return home === 'presents' ? sectionId : home;
  };

  const addItem = async (item: CatalogItem, from: BoxDisplaySectionId) => {
    const sectionId = homeSection(item, from);
    const standIn = donatedStandIn(item);
    if (standIn) {
      await e.restoreDonated(standIn.id, item);
      setToast({ message: `${item.name} takes the place of ${standIn.name}`, action: { label: 'Undo', onPress: () => void live.current.modalRemoveFromBox(item) } });
      return;
    }
    const offer = offerFor(item, sectionId, rowsFor(sectionId));
    if (offer.claimsSlot) {
      await e.addFreeItemToEmptySlot(sectionId, item);
      setToast({ message: `Added ${item.name}`, action: { label: 'Undo', onPress: () => void live.current.modalRemoveFromBox(item) } });
      return;
    }
    if (offer.swap) {
      const source = findSwapSourceLine(item, e.lineItems, e.catalog, sectionId, { geltCeiling });
      const previous = source ? e.catalog.find((c) => c.id === source.itemId) : undefined;
      if (source) {
        await e.applySwap([source.slotId], item);
        setToast({
          message: `Swapped in ${item.name}`,
          action: previous ? { label: 'Undo', onPress: () => void live.current.applySwap([source.slotId], previous) } : undefined,
        });
        return;
      }
    }
    e.setProductModalSection(sectionId);
    await e.modalAddToBox(item, { sectionId });
    setToast({ message: `Added ${item.name}`, action: { label: 'Undo', onPress: () => void live.current.modalRemoveFromBox(item) } });
  };

  /** Always a paid extra, even when the item could be swapped in. */
  const addExtra = async (it: CatalogItem, from: BoxDisplaySectionId) => {
    const sectionId = homeSection(it, from);
    e.setProductModalSection(sectionId);
    await e.modalAddToBox(it, { sectionId });
    setToast({ message: `Added ${it.name}`, action: { label: 'Undo', onPress: () => void live.current.modalRemoveFromBox(it) } });
  };

  /** Price-labelled add buttons never swap; an empty included slot is still filled for free. */
  const addOnTopOf = async (item: CatalogItem, from: BoxDisplaySectionId) => {
    const sectionId = homeSection(item, from);
    if (offerFor(item, sectionId, rowsFor(sectionId)).free) return addItem(item, sectionId);
    return addExtra(item, sectionId);
  };

  const rowNote = (g: CoalescedBoxLine, item: CatalogItem | undefined) => lineNote(g, item, kidName);

  const Row = ({ g, sectionId }: { g: CoalescedBoxLine; sectionId: BoxDisplaySectionId }) => {
    const item = byId.get(g.itemId);
    const atFloor = g.quantity <= 1;
    const donate = atFloor && g.unitCents === 0;
    const pilotPick = g.lines.some(isPilotLine);
    return (
      <Pressable onPress={() => item && setSheet({ kind: 'product', item, group: g, sectionId })} accessibilityRole="button" accessibilityLabel={`Open ${item?.name ?? g.itemId}`} style={styles.row}>
        <View style={[styles.rowImage, g.unitCents > 0 && styles.rowImageMine]}>
          <BoxItemImage size={64} imageUrl={item?.imageUrl} itemId={g.itemId} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={2}>
            {item?.name ?? g.primary.label ?? g.itemId}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={2}>
            {pilotPick ? PILOT_PICK_META : rowNote(g, item)}
            {!pilotPick && g.unitCents === 0 && donatedQty.get(g.itemId) ? ` · donating ${donatedQty.get(g.itemId)}` : ''}
          </Text>
        </View>
        {!e.locked && !pilotPick ? (
          <View style={styles.stepper}>
            <Pressable onPress={() => quantity(g, -1, sectionId)} accessibilityRole="button" accessibilityLabel={atFloor ? (donate ? 'Donate' : 'Remove') : 'Decrease quantity'} style={styles.stepBtn} hitSlop={6}>
              {donate ? <Icon icon={icons.donate} size={16} color={m.goldDark} /> : <Text style={styles.stepText}>−</Text>}
            </Pressable>
            <Text style={styles.stepQty}>{g.quantity}</Text>
            <Pressable onPress={() => quantity(g, 1, sectionId)} accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.stepBtn} hitSlop={6}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const DonatedRow = ({ item, missing }: { item: CatalogItem; missing: number }) => (
    <View style={[styles.row, styles.rowDonated]} accessibilityLabel={`${item.name}, donating`}>
      <View style={[styles.rowImage, styles.rowImageDonated]}>
        <BoxItemImage size={64} imageUrl={item.imageUrl} itemId={item.id} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {missing > 1 ? `Donating ${missing}` : 'Donating'} · goes to a family who wouldn’t otherwise celebrate
        </Text>
      </View>
      {!e.locked ? (
        <Text style={styles.undo} onPress={() => void e.restoreDonated(item.id)} accessibilityRole="button" accessibilityLabel={`Undo donating ${item.name}`}>
          Undo
        </Text>
      ) : null}
    </View>
  );

  const wrappingPaperItem = () => {
    const row = resolveByDefaultSlot(e.catalog, 'wrapping-paper');
    return (
      (row ? e.catalog.find((c) => c.id === row.id) : undefined) ??
      e.catalog.find((c) => isWrappingPaperItem(c.id, e.catalog))
    );
  };

  /** Pre-wrap is a choice, not a donation: say the presents come wrapped, pick which, and offer the paper back. */
  const wrappedNote = (rows: CoalescedBoxLine[], donated: { item: CatalogItem }[]) => {
    if (rows.some((g) => isWrappingPaperItem(g.itemId, e.catalog, g.primary))) return null;
    if (donated.some((d) => isWrappingPaperItem(d.item.id, e.catalog))) return null;
    if (!rows.some((g) => isGiftSlotLine(g.primary))) return null;
    const selected = e.wrapSelectedIds;
    const persistSelection = e.persistWrapSelection;
    const choices = selected && persistSelection ? coalesceLinesByItemId(wrappableLinesInBox(e.lineItems, e.catalog)) : null;
    const picked = choices?.filter((g) => selected?.has(g.itemId)) ?? [];
    if (e.locked && !picked.length) return null;
    const paper = wrappingPaperItem();
    const toggle = (itemId: string) => {
      if (!selected || !persistSelection) return;
      const next = new Set(selected);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      void persistSelection([...next]);
    };
    return (
      <View style={styles.wrapped}>
        {choices ? (
          <>
            <Text style={styles.wrappedTitle}>We’ll wrap your presents</Text>
            <Text style={styles.wrappedText}>
              {e.locked ? 'These come wrapped.' : 'Instead of sending paper. Tap a present to choose whether it comes wrapped.'}
            </Text>
            {(e.locked ? picked : choices).map((g) => {
              const item = byId.get(g.itemId);
              const on = selected?.has(g.itemId) ?? false;
              const name = item?.name ?? g.primary.label ?? g.itemId;
              return (
                <Pressable
                  key={g.key}
                  onPress={() => toggle(g.itemId)}
                  disabled={e.locked}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: e.locked }}
                  aria-checked={on}
                  accessibilityLabel={`Wrap ${name}`}
                  style={[styles.wrapRow, on && styles.wrapRowOn]}
                >
                  <BoxItemImage size={36} imageUrl={item?.imageUrl} itemId={g.itemId} />
                  <Text style={styles.wrapRowName} numberOfLines={2}>
                    {name}
                    {g.quantity > 1 ? ` ×${g.quantity}` : ''}
                  </Text>
                  <View style={[styles.wrapCheck, on && styles.wrapCheckOn]}>{on ? <Icon icon={icons.check} size={11} color={m.white} /> : null}</View>
                </Pressable>
              );
            })}
          </>
        ) : (
          <Text style={styles.wrappedText}>Your presents will come wrapped.</Text>
        )}
        {paper && !e.locked ? (
          <MobileButton
            label="Send me wrapping paper instead"
            variant="secondary"
            height={40}
            style={{ marginTop: 10 }}
            onPress={() => {
              e.setProductModalSection('presents');
              void (e.swapBackToPaper ? e.swapBackToPaper(paper) : e.modalAddToBox(paper));
              setToast({ message: 'Wrapping paper is back in your box' });
            }}
          />
        ) : null}
      </View>
    );
  };

  const section = (s: (typeof BOX_DISPLAY_SECTIONS)[number]) => {
    const rows = rowsFor(s.id);
    const donatedRows = (donatedBySection[s.id] ?? []).filter((d) => !rows.some((g) => g.itemId === d.item.id));
    const wrapped = s.id === 'presents' ? wrappedNote(rows, donatedRows) : null;
    const adds = (e.upsellsBySection[s.id] ?? []).slice(0, 6);
    const hasExtra = rows.some((g) => g.unitCents > 0);
    const suggestion = !hasExtra && !e.locked ? adds.find((it) => !rows.some((g) => g.itemId === it.id)) : undefined;
    return (
      <View key={s.id} onLayout={(ev) => (sectionY.current[s.id] = ev.nativeEvent.layout.y)} style={styles.section}>
        <View style={styles.sectionHead}>
          <SectionIcon id={s.id} size={18} color={m.gold} />
          <Text style={styles.sectionTitle}>{sectionTitle(s.id, s.title)}</Text>
        </View>
        {rows.map((g) => <Row key={g.key} g={g} sectionId={s.id} />)}
        {donatedRows.map((d) => <DonatedRow key={`donated:${d.item.id}`} item={d.item} missing={d.missing} />)}
        {wrapped}
        {!rows.length && !donatedRows.length && !wrapped ? <Text style={[mType.small, { paddingVertical: 10 }]}>Nothing here yet.</Text> : null}
        {suggestion ? (
          <Pressable onPress={() => setSheet({ kind: 'product', item: suggestion, group: null, sectionId: s.id })} accessibilityRole="button" style={styles.sugg}>
            <View style={styles.suggImage}>
              <BoxItemImage size={48} imageUrl={suggestion.imageUrl} itemId={suggestion.id} />
            </View>
            <Text style={styles.suggName} numberOfLines={2}>
              {suggestion.name}
            </Text>
            <Pressable onPress={() => void addOnTopOf(suggestion, s.id)} accessibilityRole="button" accessibilityLabel={`Add ${suggestion.name}`} style={styles.suggPill} hitSlop={6}>
              <Text style={styles.suggPillText}>+ {offerFor(suggestion, s.id, rows).free ? 'Included' : formatCatalogDollars(priceToAdd(suggestion, s.id))}</Text>
            </Pressable>
          </Pressable>
        ) : null}
        {!e.locked ? (
          <Pressable onPress={() => setSheet({ kind: 'tradition', sectionId: s.id })} accessibilityRole="button" style={styles.more}>
            <View style={styles.minis}>
              {adds.slice(0, 3).map((it) => (
                <View key={it.id} style={styles.mini}>
                  <BoxItemImage size={26} imageUrl={it.imageUrl} itemId={it.id} />
                </View>
              ))}
            </View>
            <Text style={styles.moreText}>{rows.length ? (s.id === 'presents' ? 'Swap or add presents' : 'Swap or add') : 'Add something'}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const mightLike = useMemo(() => {
    const inBox = new Set(e.lineItems.map((l) => l.itemId));
    const seen = new Set<string>();
    const out: CatalogItem[] = [];
    for (const s of BOX_DISPLAY_SECTIONS) for (const it of e.upsellsBySection[s.id] ?? []) if (!inBox.has(it.id) && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
    return out.slice(0, 8);
  }, [e.upsellsBySection, e.lineItems]);

  // ---- sheets ----
  const traditionSheet = (sectionId: BoxDisplaySectionId) => {
    const s = BOX_DISPLAY_SECTIONS.find((x) => x.id === sectionId)!;
    const rows = rowsFor(sectionId);
    const idx = BOX_DISPLAY_SECTIONS.findIndex((x) => x.id === sectionId);
    const next = BOX_DISPLAY_SECTIONS[idx + 1];
    const altIds = new Set(
      rows.flatMap((g) => (g.unitCents > 0 || isWrapControlSlot(g.primary.slotId) ? [] : (e.swapOptionsBySlot[g.primary.slotId] ?? []).map((o) => o.id)))
    );
    const adds = (e.upsellsBySection[sectionId] ?? []).filter((it) => !rows.some((g) => g.itemId === it.id) && (e.locked || !altIds.has(it.id)));
    const addOnTop = (it: CatalogItem) => addExtra(it, sectionId);
    return (
      <MobileSheet
        visible
        onClose={() => setSheet(null)}
        title={s.title}
        titleIcon={<SectionIcon id={sectionId} size={16} color={m.goldDark} />}
        footer={
          <View style={styles.sheetFoot}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footLabel}>Box {formatCatalogDollars(e.boxPriceCents)}{extras ? ` + ${formatCatalogDollars(extras)}` : ''}</Text>
              <Text style={styles.footTotal}>Total {formatCatalogDollars(total)}</Text>
            </View>
            <MobileButton label="Done" variant="secondary" onPress={() => setSheet(null)} height={46} style={{ width: 86 }} />
            <MobileButton label={next ? `Next: ${SHORT[next.id]}` : 'Review box'} onPress={() => setSheet(next ? { kind: 'tradition', sectionId: next.id } : { kind: 'receipt' })} height={46} style={{ width: 150 }} />
          </View>
        }
      >
        <Text style={[mType.small, { marginBottom: 12 }]}>{s.description.split('\n')[0]}</Text>
        {rows.map((g) => {
          const item = byId.get(g.itemId);
          const wrapping = isWrapControlSlot(g.primary.slotId);
          const alts = g.unitCents > 0 || wrapping ? [] : (e.swapOptionsBySlot[g.primary.slotId] ?? []).filter((o) => o.id !== g.itemId);
          const kidAges = kidPlannerAges(kids);
          const preview =
            sectionId === 'story' ? storySwapShelf(alts, kidAges) : alts.length > 2 ? alts.slice(0, 2) : alts;
          return (
            <View key={g.key} style={styles.pickBlock}>
              <View style={styles.pick}>
                <View style={[styles.rowImage, styles.rowImageMine]}>
                  <BoxItemImage size={64} imageUrl={item?.imageUrl} itemId={g.itemId} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item?.name ?? g.itemId}</Text>
                  <Text style={styles.rowMeta}>{metaFor(g, item) || `In ${yours} box`}</Text>
                </View>
                {!e.locked ? (
                  <View style={styles.stepper}>
                    <Pressable onPress={() => quantity(g, -1, sectionId)} accessibilityRole="button" accessibilityLabel={g.quantity <= 1 ? (g.unitCents === 0 ? 'Donate' : 'Remove') : 'Decrease quantity'} style={styles.stepBtn}>
                      {g.quantity <= 1 && g.unitCents === 0 ? <Icon icon={icons.donate} size={16} color={m.goldDark} /> : <Text style={styles.stepText}>−</Text>}
                    </Pressable>
                    <Text style={styles.stepQty}>{g.quantity}</Text>
                    <Pressable onPress={() => quantity(g, 1, sectionId)} accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.stepBtn}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {wrapping && g.unitCents === 0 && !e.locked ? (
                <MobileButton label="Wrap gifts for me instead" variant="secondary" height={40} style={{ marginTop: 10 }} onPress={() => { void e.swapToPreWrap(g.lines.map((l) => l.slotId)); setToast({ message: 'We’ll wrap your gifts' }); }} />
              ) : null}
              {alts.length && !e.locked ? (
                <>
                  <Text style={styles.altHead}>Prefer a different one? Swapping is included.</Text>
                  <HorizontalDragScrollView
                    showsHorizontalScrollIndicator={false}
                    style={styles.altScroll}
                    contentContainerStyle={styles.altRow}
                    accessibilityLabel={sectionId === 'story' ? 'Other books' : 'Other options'}
                  >
                    {preview.map((o) => (
                      <View key={o.id} style={styles.altCard}>
                        <Pressable onPress={() => setSheet({ kind: 'product', item: o, group: null, sectionId })} accessibilityRole="button" accessibilityLabel={`Open ${o.name}`}>
                          <BoxItemImage size={116} imageUrl={o.imageUrl} itemId={o.id} />
                        </Pressable>
                        <Text style={styles.altName} numberOfLines={2}>
                          {o.name}
                        </Text>
                        <View style={styles.altBtns}>
                          <MobileButton
                            label="Swap"
                            variant="secondary"
                            height={32}
                            style={{ width: 58, paddingHorizontal: 4 }}
                            onPress={() => {
                              void e.applySwap(g.lines.map((l) => l.slotId), o);
                              setToast({ message: `Swapped in ${o.name}`, action: item ? { label: 'Undo', onPress: () => void live.current.applySwap(g.lines.map((l) => l.slotId), item) } : undefined });
                            }}
                          />
                          <MobileButton
                            label={priceToAdd(o, sectionId) ? `+${formatCatalogDollars(priceToAdd(o, sectionId))}` : '+ Add'}
                            accessibilityLabel={priceToAdd(o, sectionId) ? `Add ${o.name} on top for ${formatCatalogDollars(priceToAdd(o, sectionId))}` : `Add ${o.name} on top, included`}
                            height={32}
                            style={{ width: 52, paddingHorizontal: 4 }}
                            onPress={() => void addOnTop(o)}
                          />
                        </View>
                      </View>
                    ))}
                    {sectionId === 'story' || alts.length > 2 ? (
                      <Pressable
                        onPress={() => {
                          setSheet(null);
                          navigateMainStack('StorefrontCategory', { category: BROWSE_AISLE[sectionId].slug });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={BROWSE_AISLE[sectionId].label}
                        style={styles.browseCard}
                      >
                        <Text style={styles.browseTitle}>{BROWSE_AISLE[sectionId].label}</Text>
                      </Pressable>
                    ) : null}
                  </HorizontalDragScrollView>
                </>
              ) : null}
            </View>
          );
        })}
        {adds.length && !e.locked ? (
          <>
            <Text style={[mType.h3, { marginTop: 8, marginBottom: 10 }]}>Add {rows.length ? 'on top' : 'something'}</Text>
            <View style={styles.addGrid}>
              {(sectionId === 'story' ? storySwapShelf(adds, kidPlannerAges(kids), 8) : adds.slice(0, 8)).map((it) => {
                const offer = offerFor(it, sectionId, rows);
                const storyChoice = sectionId === 'story' && offer.swap && !offer.free;
                return (
                  <View key={it.id} style={{ width: 150, gap: 8 }}>
                    <ProductTileMobile
                      item={it}
                      width={150}
                      onPress={() => setSheet({ kind: 'product', item: it, group: null, sectionId })}
                      status={offer.free ? { kind: 'inbox', text: 'Included' } : null}
                      action={storyChoice ? undefined : { label: offer.label, onPress: () => void addItem(it, sectionId), variant: 'secondary' }}
                    />
                    {storyChoice ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <MobileButton label="Swap" variant="secondary" height={32} style={{ flex: 1, width: undefined, paddingHorizontal: 4 }} onPress={() => void addItem(it, sectionId)} />
                        <MobileButton label={`+${formatCatalogDollars(offer.cents)}`} accessibilityLabel={`Add ${it.name} on top for ${formatCatalogDollars(offer.cents)}`} height={32} style={{ flex: 1, width: undefined, paddingHorizontal: 4 }} onPress={() => void addOnTop(it)} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </MobileSheet>
    );
  };

  const priceToAdd = (it: CatalogItem, from: BoxDisplaySectionId) => e.addOnTopCents(it, homeSection(it, from));

  const productSheet = (item: CatalogItem, group: CoalescedBoxLine | null, sectionId: BoxDisplaySectionId) => {
    const wrapping = group ? isWrapControlSlot(group.primary.slotId) : false;
    const alts = group && group.unitCents === 0 && !wrapping ? (e.swapOptionsBySlot[group.primary.slotId] ?? []).filter((o) => o.id !== group.itemId) : [];
    const desc = (item.description ?? '').trim();
    const offer = offerFor(item, sectionId, rowsFor(sectionId));
    const swapSource = !group && offer.swap && !e.locked ? findSwapSourceLine(item, e.lineItems, e.catalog, sectionId, { geltCeiling }) : null;
    const swapFrom = swapSource ? byId.get(swapSource.itemId) : undefined;
    return (
      <MobileSheet
        visible
        onClose={() => setSheet(null)}
        titleAction={{ label: `‹ ${BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)?.title ?? 'Back'}`, onPress: () => setSheet({ kind: 'tradition', sectionId }) }}
        footer={
          group ? (
            <View style={styles.sheetFoot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.footLabel}>{group.unitCents > 0 ? `Added · ${formatCatalogDollars(group.unitCents)} each` : `In ${yours} box · included`}</Text>
                <Text style={styles.footTotal}>Quantity {group.quantity}</Text>
              </View>
              <MobileButton label="Done" onPress={() => setSheet(null)} height={46} style={{ width: 120 }} />
            </View>
          ) : swapSource ? null : (
            <MobileButton label={`${offer.swap ? 'Swap into' : 'Add to'} ${gift ? 'their' : 'my'} box${offer.swap ? '' : offer.free ? ' · included' : ` · +${formatCatalogDollars(offer.cents)}`}`} onPress={() => { void addItem(item, sectionId); setSheet(null); }} />
          )
        }
      >
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.sheetPhoto} resizeMode="cover" /> : null}
        <Text style={[mType.h2, { marginTop: 14 }]} {...balanceProps}>
          {item.name}
        </Text>
        {group ? <Text style={[mType.smallDark, { marginTop: 4 }]}>{metaFor(group, item) || `In ${yours} box`}</Text> : null}
        {desc ? <Text style={[mType.body, { marginTop: 10 }]}>{desc.length > 240 ? `${desc.slice(0, 237).trimEnd()}…` : desc}</Text> : null}
        <ProductNote
          itemId={item.id}
          style={[mType.body, styles.note]}
          linkStyle={styles.noteLink}
          onOpenProduct={(slug) => {
            const next = byId.get(slug);
            if (next) openProductSheet(next);
          }}
        />
        {swapSource ? (
          <View style={{ gap: 10, marginTop: 16 }}>
            <Pressable onPress={() => { void addItem(item, sectionId); setSheet(null); }} accessibilityRole="button" accessibilityLabel={`Swap ${item.name} into ${yours} box`} style={styles.opt}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>Swap it in</Text>
                <Text style={styles.optSub} numberOfLines={1}>Instead of {yours} {swapFrom?.name ?? 'current pick'}</Text>
              </View>
              <View style={styles.optPill}><Text style={styles.optPillText}>Included</Text></View>
            </Pressable>
            <Pressable onPress={() => { void addExtra(item, sectionId); setSheet(null); }} accessibilityRole="button" accessibilityLabel={`Add ${item.name} on top for ${formatCatalogDollars(offer.cents)}`} style={styles.opt}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>Add one on top</Text>
                <Text style={styles.optSub} numberOfLines={1}>Keeps everything already in {yours} box</Text>
              </View>
              <View style={styles.optPill}><Text style={styles.optPillText}>+ {formatCatalogDollars(offer.cents)}</Text></View>
            </Pressable>
          </View>
        ) : null}
        <Pressable onPress={() => { setSheet(null); navigation.navigate('CatalogProduct', { slug: item.id }); }} accessibilityRole="button" style={{ marginTop: 10 }}>
          <Text style={styles.link}>See full details ›</Text>
        </Pressable>
        {wrapping && group && group.unitCents === 0 && !e.locked ? (
          <MobileButton
            label="Wrap gifts for me instead"
            variant="secondary"
            height={44}
            style={{ marginTop: 20 }}
            onPress={() => {
              void e.swapToPreWrap(group.lines.map((l) => l.slotId));
              setSheet(null);
              setToast({ message: 'We’ll wrap your gifts' });
            }}
          />
        ) : null}
        {alts.length && group && !e.locked && !group.lines.some(isPilotLine) ? (
          <>
            <Text style={[mType.h3, { marginTop: 20, marginBottom: 10 }]}>Swap it for</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.altRow}>
              {alts.slice(0, 6).map((o) => (
                <View key={o.id} style={styles.alt}>
                  <BoxItemImage size={104} imageUrl={o.imageUrl} itemId={o.id} />
                  <Text style={styles.altName} numberOfLines={2}>
                    {o.name}
                  </Text>
                  <MobileButton label="Swap" variant="secondary" height={34} onPress={() => { void e.applySwap(group.lines.map((l) => l.slotId), o); setSheet(null); }} />
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}
      </MobileSheet>
    );
  };

  const receiptSheet = (donatedOpen: boolean) => {
    const receiptSections = BOX_DISPLAY_SECTIONS.flatMap((s) => {
      const rows = rowsFor(s.id);
      return rows.length ? [{ section: s, rows }] : [];
    });
    return (
    <MobileSheet visible onClose={() => setSheet(null)} title={gift ? 'Their box' : 'Your box'} titleAction={{ label: 'Keep editing', onPress: () => setSheet(null) }} footer={<MobileButton label={`${gift ? gift.nextLabel : 'Checkout'} · ${formatCatalogDollars(total)}`} onPress={() => { setSheet(null); if (gift) gift.onNext(); else e.goToCheckout(); }} />}>
      {receiptSections.map(({ section: s, rows }, index) => {
        return (
          <View key={s.id} style={[styles.rcGroup, index === 0 && styles.rcFirst]}>
            <View style={styles.sectionHead}>
              <SectionIcon id={s.id} size={13} color={m.goldDark} />
              <Text style={styles.rcHead}>{s.title}</Text>
            </View>
            {rows.map((g) => {
              const item = byId.get(g.itemId);
              return (
                <View key={g.key} style={styles.rcRow}>
                  <BoxItemImage size={32} imageUrl={item?.imageUrl} itemId={g.itemId} />
                  <Text style={styles.rcName} numberOfLines={1}>
                    {item?.name ?? g.itemId}
                    {g.quantity > 1 ? ` ×${g.quantity}` : ''}
                  </Text>
                  <Text style={[styles.rcVal, g.unitCents === 0 && styles.rcIncluded]}>{g.unitCents > 0 ? `+${formatCatalogDollars(g.unitCents * g.quantity)}` : 'Included'}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
      <View style={styles.rcTotals}>
        <Line label={`Box${e.children.length > 1 ? ` (${e.children.length} kids)` : ''}`} value={formatCatalogDollars(e.boxPriceCents)} />
        {extras ? <Line label="Add-ons" value={`+${formatCatalogDollars(extras)}`} /> : null}
        {donatedValue ? (
          <Pressable onPress={() => setSheet({ kind: 'receipt', donatedOpen: !donatedOpen })} accessibilityRole="button" accessibilityState={{ expanded: donatedOpen }} accessibilityLabel={`Donated ${formatCatalogDollars(donatedValue)}`}>
            <View style={styles.line}>
              <View style={styles.donatedToggle}>
                <Text style={styles.lineLabel}>Donated</Text>
                <View style={donatedOpen ? styles.flip : undefined}>
                  <Icon icon={icons.chevronDown} size={11} color={m.muted} />
                </View>
              </View>
              <Text style={styles.lineValue}>{formatCatalogDollars(donatedValue)}</Text>
            </View>
          </Pressable>
        ) : null}
        {donatedValue && donatedOpen ? (
          <View style={styles.donatedList}>
            {e.donatedItems.map(({ item, missing }) => (
              <View key={item.id} style={[styles.rcRow, styles.rowDonated]}>
                <BoxItemImage size={32} imageUrl={item.imageUrl} itemId={item.id} />
                <Text style={styles.rcName} numberOfLines={1}>
                  {item.name}
                  {missing > 1 ? ` ×${missing}` : ''}
                </Text>
              </View>
            ))}
            <Text style={mType.small}>These go to families who couldn't otherwise celebrate. Changed your mind? Tap Undo on the item in {yours} box.</Text>
          </View>
        ) : null}
        <Line label="Shipping" value="Free" />
        <Line label="Total" value={formatCatalogDollars(total)} strong />
      </View>
    </MobileSheet>
    );
  };

  const body = (
      <View style={{ paddingBottom: STICKY_BAR_CLEARANCE + 12 }}>
        <View style={styles.head}>
          {gift ? (
            <View style={styles.giftBanner}>
              <Icon icon={icons.gift} size={13} color={m.goldDark} />
              <Text style={styles.giftBannerText}>{gift.banner}</Text>
            </View>
          ) : null}
          <Text style={mType.h1}>{gift ? 'Their Hanukkah box' : 'Your Hanukkah box'}</Text>
          <Text style={styles.headSub} {...balanceProps}>Everything you need for Hanukkah, picked for {yours} family. Keep it as is, or change anything.</Text>
          <View style={styles.lockLine}>
            <Icon icon={icons.calendar} size={13} color={m.gold} />
            {gift ? <Text style={styles.lockText}>Send by {lockShort}</Text> : (
            <Text style={styles.lockText}>
              {e.locked ? `Locked ${lockShort}` : `Change anything until ${lockShort}${daysLeft != null ? ` · ${daysLeft} days left` : ''} · `}
              {e.locked ? null : (
                <Text style={styles.lockLink} onPress={addToCalendar} accessibilityRole="link">
                  Add to calendar
                </Text>
              )}
            </Text>
            )}
          </View>
        </View>

        {!gift && !e.locked && !e.guestViewOnly ? <PilotReturnBanner wrapperStyle={styles.pad} hasPicks={e.lineItems.some(isPilotLine)} /> : null}

        <View style={styles.pad}>
          <BoxSummary size="sm" title={gift ? 'In their box' : 'In your box'} sub={`${thingCount} things · ${formatCatalogDollars(total)}`} items={thumbs} link={<Pressable onPress={() => setSheet({ kind: 'receipt' })} accessibilityRole="button" hitSlop={8}><Text style={styles.link}>See list</Text></Pressable>} />
          {!gift && !e.openOrder ? (
            <Text style={styles.held}>
              {NOT_HELD_COPY}{' '}
              <Text style={styles.link} onPress={e.goToCheckout}>
                Add shipping and payment
              </Text>
            </Text>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}>
          {BOX_DISPLAY_SECTIONS.map((s) => (
            <Pressable key={s.id} onPress={() => jumpTo(s.id)} accessibilityRole="button" accessibilityState={{ selected: active === s.id }} style={[styles.chip, active === s.id && styles.chipOn]}>
              <Text style={[styles.chipText, active === s.id && styles.chipTextOn]}>{SHORT[s.id]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {BOX_DISPLAY_SECTIONS.map(section)}

        {mightLike.length ? (
          <View style={styles.like}>
            <Text style={[styles.sectionTitle, styles.likeHead]}>Other things you might like</Text>
            <Text style={[styles.likeSub, styles.likeHead]}>Add them on top of {yours} box.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.likeRail}>
              {mightLike.map((it) => {
                const sectionId = displaySectionForCatalogItem(it);
                const free = offerFor(it, sectionId, rowsFor(sectionId)).free;
                return (
                  <View key={it.id} style={{ width: 132, gap: 4 }}>
                    <ProductTileMobile item={it} width={132} onPress={() => setSheet({ kind: 'product', item: it, group: null, sectionId })} hidePrice />
                    <Text style={styles.likePrice}>{free ? 'Included' : formatCatalogDollars(priceToAdd(it, sectionId))}</Text>
                    <Pressable onPress={() => void addOnTopOf(it, sectionId)} accessibilityRole="button" accessibilityLabel={`Add ${it.name}`} style={styles.likeAdd}>
                      <Text style={styles.likeAddText}>+ Add</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        {!gift && !e.guestViewOnly ? (
          <View style={styles.rav}>
            <MobileButton label="Talk it over with Rav" variant="secondary" onPress={talkToRav} />
          </View>
        ) : null}
        {!gift && !e.locked && !e.guestViewOnly ? (
          <Pressable onPress={() => setResetOpen(true)} accessibilityRole="button" accessibilityLabel="Start over" hitSlop={8} style={styles.reset}>
            <Text style={styles.resetText}>Start over</Text>
          </Pressable>
        ) : null}
        {lowStockNames.length ? (
          <Text style={styles.lowStock}>
            Please note: {listNames(lowStockNames)} {lowStockNames.length > 1 ? 'are' : 'is'} low in stock and will be swapped automatically when{' '}
            {lowStockNames.length > 1 ? 'they sell' : 'it sells'} out.{' '}
            <Text style={styles.link} onPress={e.goToCheckout}>
              {e.cardOnFile ? 'Check out' : 'Add payment info'}
            </Text>{' '}
            to secure {yours} inventory. Continue editing {yours} box until {e.lockAt ? `the ${lockShort} lock date` : 'it locks'}. Your card will not be charged until the lock date.
          </Text>
        ) : null}
      </View>
  );

  const overlays = (
    <>
      <StickyBar
        label={`${gift ? 'Gift box' : 'Box'} ${formatCatalogDollars(e.boxPriceCents)}${extras ? ` + ${formatCatalogDollars(extras)}` : ''}${donatedValue ? ` · Donated ${formatCatalogDollars(donatedValue)}` : ''}`}
        total={`Total ${formatCatalogDollars(total)}`}
        onSummaryPress={() => setSheet({ kind: 'receipt', donatedOpen: donatedValue > 0 })}
        cta={
          gift
            ? { label: gift.nextLabel, onPress: gift.onNext }
            : { label: e.openOrder ? 'Save changes' : 'Checkout', onPress: e.openOrder && e.hasSessionEdits ? () => void e.saveOrderUpdates() : e.goToCheckout, disabled: e.savingOrder, busy: e.savingOrder }
        }
        testID="mobile-box-bar"
        ctaFill={false}
      />

      {sheet?.kind === 'tradition' ? traditionSheet(sheet.sectionId) : null}
      {sheet?.kind === 'product' ? productSheet(sheet.item, sheet.group, sheet.sectionId) : null}
      {sheet?.kind === 'receipt' ? receiptSheet(!!sheet.donatedOpen) : null}
      <MobileSheet
        visible={resetOpen}
        onClose={() => { if (!resetBusy) setResetOpen(false); }}
        title="Start over"
        accessibilityLabel="Start over"
      >
        <Text style={[mType.body, { marginBottom: 16 }]}>This clears what you picked. You can start the questions again, or leave with no box.</Text>
        <View style={{ gap: 10 }}>
          <MobileButton
            label="Start fresh"
            busy={resetBusy}
            onPress={() => {
              setResetBusy(true);
              void startOwnBoxBuild((opts) => refresh(opts), household?.id).finally(() => {
                setResetBusy(false);
                setResetOpen(false);
              });
            }}
          />
          <MobileButton
            label="I don't want a box"
            variant="secondary"
            disabled={resetBusy}
            onPress={() => {
              setResetBusy(true);
              void abandonOwnBox(household?.id, (opts) => refresh(opts)).finally(() => {
                setResetBusy(false);
                setResetOpen(false);
                navigateMainStack('StorefrontHome');
              });
            }}
          />
          <MobileButton label="Cancel" variant="secondary" disabled={resetBusy} onPress={() => setResetOpen(false)} />
        </View>
      </MobileSheet>
      <MobileToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );

  if (gift) {
    return (
      <View style={{ flex: 1, backgroundColor: m.white }}>
        {gift.header}
        <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32} style={{ flex: 1 }}>
          {body}
        </ScrollView>
        {overlays}
      </View>
    );
  }
  return (
    <StorefrontChrome scrollRef={scrollRef} onPageScroll={onScroll}>
      {body}
      {overlays}
    </StorefrontChrome>
  );
}

function lineNote(g: CoalescedBoxLine, item: CatalogItem | undefined, kidName: (id?: string | null) => string | null): string {
  const kid = g.lines.map((l) => kidName(l.childId)).find(Boolean);
  const forKid = kid ? ` for ${kid}` : '';
  if (g.unitCents > 0) return `Added${forKid} · ${formatCatalogDollars(g.unitCents * g.quantity)}`;
  const included = g.includedQuantity ?? g.quantity;
  const extra = Math.max(0, g.quantity - included);
  if (extra > 0 && item) return `Included${forKid} ×${included} · +${extra} for ${formatCatalogDollars(extra * resolveCatalogDisplayPrices(item).memberCents)}`;
  return `Included${forKid}`;
}

function listNames(names: string[]): string {
  if (names.length < 3) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: mGutter, paddingTop: 28, paddingBottom: 8, gap: 12 },
  giftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: m.beige, borderRadius: 16, paddingHorizontal: 12, height: 32 },
  giftBannerText: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  headSub: { fontSize: 15, lineHeight: 22, color: m.muted, ...mFont(300) },
  pad: { paddingHorizontal: mGutter, paddingTop: 8 },
  lockLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lockText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: m.muted, ...mFont(400) },
  lockLink: { color: m.goldDark, textDecorationLine: 'underline' },
  held: { fontSize: 13, color: m.goldDark, lineHeight: 19, marginTop: 16, ...mFont(400) },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  note: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: m.beige, overflow: 'hidden' },
  noteLink: { color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  chipsBar: {
    marginTop: 12,
    backgroundColor: m.white,
    borderBottomWidth: 1,
    borderBottomColor: m.line,
    zIndex: 30,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as object) : {}),
  },
  chips: { paddingHorizontal: mGutter, gap: 8, paddingVertical: 10 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipText: { fontSize: 13, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
  section: { paddingHorizontal: mGutter, paddingTop: 32, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: m.line },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 20, lineHeight: 25, letterSpacing: -0.3, color: m.ink, ...mFont(400) },
  sugg: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 14, paddingBottom: 4, borderTopWidth: 1, borderTopColor: m.lineWarm, borderStyle: 'dashed' },
  suggImage: { borderRadius: 8, overflow: 'hidden' },
  suggName: { flex: 1, fontSize: 14, lineHeight: 18, color: m.ink, ...mFont(400) },
  suggPill: { height: 30, paddingHorizontal: 11, borderRadius: 15, backgroundColor: m.ink, justifyContent: 'center' },
  suggPillText: { fontSize: 12, color: m.gold, ...mFont(400) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowImage: { borderRadius: mRadius.md, overflow: 'hidden' },
  rowImageMine: { borderWidth: 2, borderColor: m.gold },
  rowDonated: { opacity: 0.75 },
  rowImageDonated: Platform.OS === 'web' ? ({ filter: 'grayscale(1)' } as object) : {},
  undo: { fontSize: 14, color: m.goldDark, textDecorationLine: 'underline', paddingHorizontal: 4, paddingVertical: 8, ...mFont(500) },
  rowName: { fontSize: 15, color: m.ink, lineHeight: 19, letterSpacing: -0.2, ...mFont(400) },
  rowMeta: { fontSize: 12.5, color: m.goldDark, marginTop: 3, lineHeight: 17, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 20, height: 38, backgroundColor: m.white },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark },
  stepQty: { minWidth: 18, textAlign: 'center', fontSize: 15, color: m.ink, ...mFont(400) },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, marginTop: 16, borderWidth: 1, borderColor: m.gold, borderRadius: 10 },
  moreText: { fontSize: 14, color: m.ink, ...mFont(400) },
  minis: { flexDirection: 'row', paddingLeft: 8 },
  mini: { marginLeft: -8, borderWidth: 2, borderColor: m.white, borderRadius: 7, overflow: 'hidden' },
  chev: { fontSize: 20, color: m.goldDark },
  like: { backgroundColor: m.beige, paddingTop: 32, paddingBottom: 16 },
  likeHead: { paddingHorizontal: mGutter },
  likeSub: { fontSize: 14, color: m.muted, marginTop: 6, marginBottom: 14, ...mFont(300) },
  likeRail: { gap: 12, paddingHorizontal: mGutter },
  likePrice: { fontSize: 12, color: m.muted, ...mFont(400) },
  likeAdd: { alignSelf: 'flex-start', height: 34, paddingHorizontal: 14, borderRadius: 18, backgroundColor: m.ink, justifyContent: 'center', marginTop: 4 },
  likeAddText: { fontSize: 13, color: m.gold, ...mFont(400) },
  rav: { paddingHorizontal: mGutter, marginTop: 24 },
  reset: { alignSelf: 'center', marginTop: 18, paddingVertical: 6, paddingHorizontal: 12 },
  resetText: { fontSize: 12.5, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  lowStock: { fontSize: 13, lineHeight: 19, color: m.muted, marginTop: 18, marginHorizontal: mGutter, ...mFont(400) },
  sheetFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footLabel: { fontSize: 12, color: m.muted, ...mFont(300) },
  footTotal: { fontSize: 16, color: m.ink, ...mFont(500) },
  pickBlock: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: mRadius.md, backgroundColor: m.beige, borderWidth: 1.5, borderColor: m.gold },
  altHead: { fontSize: 13, color: m.muted, marginTop: 12, marginBottom: 8, ...mFont(400) },
  altScroll: { width: '100%', flexGrow: 0, flexShrink: 0 },
  altRow: { gap: 10, paddingRight: 8, paddingVertical: 2 },
  alt: { width: 104, gap: 6 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingHorizontal: 14, paddingVertical: 10, borderRadius: mRadius.md, borderWidth: 1, borderColor: m.gold, backgroundColor: m.white },
  optTitle: { fontSize: 15.5, color: m.ink, ...mFont(400) },
  optSub: { fontSize: 12.5, color: m.muted, marginTop: 2, ...mFont(400) },
  optPill: { backgroundColor: m.ink, borderRadius: 999, paddingHorizontal: 14, height: 32, alignItems: 'center', justifyContent: 'center' },
  optPillText: { fontSize: 13.5, color: m.gold, ...mFont(400) },
  altCard: { width: 128, gap: 6, padding: 6, borderRadius: mRadius.md, borderWidth: 1, borderColor: m.line, backgroundColor: m.white },
  browseCard: { width: 128, minHeight: 210, borderRadius: mRadius.md, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center', padding: 14 },
  browseTitle: { fontSize: 15, lineHeight: 20, color: m.ink, textAlign: 'center', ...mFont(500) },
  wrapped: { marginTop: 8, padding: 14, borderRadius: mRadius.md, backgroundColor: m.beige },
  wrappedText: { fontSize: 14, lineHeight: 20, color: m.ink, ...mFont(400) },
  wrappedTitle: { fontSize: 15.5, lineHeight: 21, color: m.ink, marginBottom: 2, ...mFont(500) },
  wrapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: m.lineWarm, backgroundColor: m.white },
  wrapRowOn: { borderColor: m.gold },
  wrapRowName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, color: m.ink, ...mFont(400) },
  wrapCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  wrapCheckOn: { backgroundColor: m.goldDark, borderColor: m.goldDark },
  altBtns: { flexDirection: 'row', gap: 6 },
  altName: { fontSize: 12.5, color: m.ink, lineHeight: 16, minHeight: 32, ...mFont(400) },
  addGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sheetPhoto: { width: 230, height: 230, alignSelf: 'center', borderRadius: mRadius.lg, backgroundColor: m.img },
  rcGroup: { marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: m.line },
  rcFirst: { marginTop: 14 },
  rcHead: { fontSize: 14, color: m.ink, ...mFont(500) },
  rcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rcName: { flex: 1, fontSize: 14, color: m.ink, ...mFont(400) },
  rcVal: { fontSize: 13.5, color: m.ink, ...mFont(400) },
  rcIncluded: { color: m.muted },
  rcTotals: { borderTopWidth: 1, borderTopColor: m.line, paddingTop: 10, gap: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 14, color: m.body, ...mFont(400) },
  lineValue: { fontSize: 14, color: m.ink, ...mFont(400) },
  lineStrong: { fontSize: 16, color: m.ink, ...mFont(500) },
  donatedToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flip: { transform: [{ rotate: '180deg' }] },
  donatedList: { paddingLeft: 4, paddingBottom: 6, gap: 2 },
});
