import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSession } from '../../hooks/useSession';
import { useActiveProfile } from '../../context/ActiveProfileContext';
import { PILOT_PARENT_ONLY } from '../../constants/pilotFeatures';
import { useAuthStore } from '../../stores/authStore';
import { useBoxDraft } from '../../hooks/useBoxDraft';
import { useGuestBoxFlow } from '../../hooks/useGuestBoxFlow';
import { useWebLayout } from '../../hooks/useWebLayout';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { getHanukkahConfig } from '../../services/firestore/config';
import { useEffectiveBoxLocked, usePreviewNow } from '../../hooks/useUserStatePreview';
import type { MainStackParamList } from '../../navigation/types';
import { useCatalog } from '../../hooks/useCatalog';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import {
  formatCatalogDollars,
  formatDollars,
  totalCents,
  unitCentsForTier,
  catalogSlotId,
} from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids, resolveByDefaultSlot, WRAP_POLICY } from '../../services/box/boxRules';
import { resolveSectionUpsellItems, resolveSwapOptionsForItem } from '../../services/box/sectionUpsells';
import { inferPricingTier, resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { BoxItemRow } from '../../components/box/BoxItemRow';
import { BoxSlotVoteRow, WrappedGiftPlaceholder } from '../../components/box/BoxSlotVoteRow';
import { StickySectionNav } from '../../components/box/StickySectionNav';
import { BoxDetailToolbar } from '../../components/box/BoxDetailToolbar';
import { BoxDetailSectionBlock } from '../../components/box/BoxDetailSectionBlock';
import { PresentsWrappableList } from '../../components/box/PresentsWrappableList';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  isWrapControlSlot,
  removeCoalescedGroup,
  resolveBoxItemAttributionKind,
  wrappableLinesInBox,
  wrapControlLines,
} from '../../components/box/boxLineDisplay';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import {
  BOX_DISPLAY_SECTIONS,
  groupLineItemsByDisplaySection,
  nonEmptyDisplaySectionIds,
  type BoxDisplaySectionId,
} from '../../constants/boxDisplaySections';
import { GuestBoxAuthBanner } from '../../components/box/GuestBoxAuthBanner';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { defaultIsSurprise } from '../../constants/boxPracticeGroups';
import {
  buildVoter,
  isVotablePerKidSlot,
  isWrappableSlot,
  toggleSlotVote,
  topPickItemId,
} from '../../services/box/slotVotes';
import { usePaymentGate } from '../../hooks/usePaymentGate';
import { updatePilotBoxOrder } from '../../services/checkout/updatePilotBoxOrder';
import { useBoxDetailScroll } from '../../hooks/useBoxDetailScroll';
import { createBoxDetailStyles } from '../../components/box/boxDetailLayout';
import {
  spacing,
  typography,
  borderRadius,
  shadows,
  shadowsWeb,
  MOBILE_GUTTER,
} from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

/** Clearance under scroll content for the floating order-summary card. */
const SUMMARY_FLOAT_CLEARANCE = 140;

/** Stable compare of draft vs committed order lines (swaps / qty / wrap). */
function lineItemsFingerprint(items: BoxLineItem[]): string {
  return [...items]
    .map(
      (li) =>
        `${li.slotId}\0${li.itemId}\0${li.quantity}\0${li.unitCents}\0${li.isSurprise ? 1 : 0}\0${li.childId ?? ''}`
    )
    .sort()
    .join('\n');
}

function notifyUser(title: string, body: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

function formatCallableError(e: unknown): string {
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
  const message = e instanceof Error ? e.message : 'Try again in a moment.';
  if (
    code.includes('not-found') ||
    /not-found|NOT_FOUND|does not exist/i.test(message)
  ) {
    return 'The update function isn’t on the server yet. Deploy Cloud Functions (updatePilotBoxOrder), then try again.';
  }
  return message;
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

export function MyBoxScreen() {
  const { colors } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isDesktop, widePanelMaxWidth } = useWebLayout();
  const styles = useMemo(() => createMyBoxStyles(colors, isDesktop), [colors, isDesktop]);
  const detailStyles = useMemo(
    () => createBoxDetailStyles(colors, { desktop: isDesktop }),
    [colors, isDesktop],
  );
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { loading: sessionLoading, profile, household } = useSession();
  const user = useAuthStore((s) => s.user);
  const { isChildProfile, isParentProfile, activeChild } = useActiveProfile();
  const showKidBoxUi = isChildProfile && !PILOT_PARENT_ONLY;
  const { lineItems, slotVotes, sealedSectionIds, wrapSelectedItemIds, children, loading: draftLoading, persist, persistSlotVotes, persistWrapSelection } =
    useBoxDraft();
  const { guestNeedsOnboarding, guestViewOnly, requireAuthToCustomize } = useGuestBoxFlow();
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);

  usePublishRavSurface({ type: 'box', id: 'hanukkah-2026', label: 'Hanukkah 2026 Box' });

  const { items: catalog } = useCatalog();
  const [loading, setLoading] = useState(true);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [estimatedDeliveryBy, setEstimatedDeliveryBy] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const now = usePreviewNow();
  const locked = useEffectiveBoxLocked(lockAt);
  const { cardOnFile, openOrder, guardMutation, refreshOrders } = usePaymentGate();

  /** Flat $80 box (+ $10/extra kid list framing where applicable). */
  const boxPriceCents = useMemo(
    () => listBoxCentsForKids(Math.max(1, children.length)),
    [children.length]
  );

  const wrapSelectedIds = useMemo(
    () => new Set(wrapSelectedItemIds),
    [wrapSelectedItemIds]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const config = await getHanukkahConfig();
    setLockAt(config.lockAt);
    setStartsOn(config.startsOn);
    setEstimatedDeliveryBy(config.estimatedDeliveryBy);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (guestNeedsOnboarding) {
      startBuildBox();
    }
  }, [guestNeedsOnboarding, startBuildBox]);

  const grouped = useMemo(
    () => groupLineItemsByDisplaySection(lineItems, catalog),
    [lineItems, catalog]
  );

  const hasPresentsChecklist = useMemo(() => {
    if (isChildProfile) return false;
    return (
      wrappableLinesInBox(lineItems, catalog).length > 0 ||
      wrapControlLines(lineItems).length > 0
    );
  }, [lineItems, catalog, isChildProfile]);

  const visibleSectionIds = useMemo(() => {
    if (isChildProfile) {
      // Kid gifts may live under dreidel/candles/etc. — follow real section homes.
      return nonEmptyDisplaySectionIds(grouped);
    }
    const candidates = BOX_DISPLAY_SECTIONS.map((section) => section.id);
    return nonEmptyDisplaySectionIds(
      grouped,
      candidates,
      hasPresentsChecklist ? ['presents'] : undefined
    );
  }, [grouped, isChildProfile, hasPresentsChecklist]);

  const { scrollRef, contentRef, activeSection, registerSection, onSectionLayout, onScroll, scrollToSection } =
    useBoxDetailScroll({ visibleSectionIds });

  const extraLineItems = useMemo(
    () => lineItems.filter((li) => li.itemId.startsWith('extra-') || li.slotId.startsWith('extra-')),
    [lineItems]
  );

  const alaCarteItems = useMemo(
    () =>
      lineItems.filter((li) => {
        if (li.unitCents <= 0) return false;
        const item = catalog.find((c) => c.id === li.itemId);
        return item && inferPricingTier(item) === 'alaCarte';
      }),
    [lineItems, catalog]
  );

  /** Recompute when catalog/lines change — never cache empty results across loads. */
  const swapOptionsBySlot = useMemo(() => {
    if (!catalog.length || !lineItems.length) return {} as Record<string, CatalogItem[]>;
    const next: Record<string, CatalogItem[]> = {};
    for (const li of lineItems) {
      const current = catalog.find((c) => c.id === li.itemId);
      next[li.slotId] = current ? resolveSwapOptionsForItem(current, catalog, 6) : [];
    }
    return next;
  }, [lineItems, catalog]);

  const applySwap = async (slotIds: string[], newItem: CatalogItem) => {
    if (locked) return;
    // Guests edit the local draft (“Sign up to save”); payment gate is for signed-in paid extras.
    const tier = inferPricingTier(newItem);
    const nextUnit = unitCentsForTier(tier, newItem.dollarCostCents);
    if (!guestViewOnly && nextUnit > 0 && !guardMutation()) return;
    const idSet = new Set(slotIds);
    const next = lineItems.map((li) =>
      idSet.has(li.slotId)
        ? {
            ...li,
            slotId: slotIdAfterSwap(li.slotId, newItem),
            itemId: newItem.id,
            unitCents: nextUnit,
            label: newItem.name,
          }
        : li
    );
    await persist(next);
  };

  const swapToPreWrap = async (slotIds: string[]) => {
    const row = resolveByDefaultSlot(catalog, WRAP_POLICY.preWrapSlot);
    const preWrap =
      (row ? catalog.find((c) => c.id === row.id) : undefined) ??
      catalog.find(
        (c) =>
          catalogSlotId(c.slotId) === 'pre-wrap' ||
          c.defaultSlot === 'pre-wrap' ||
          /pre.?wrap/i.test(`${c.id} ${c.name}`)
      );
    if (!preWrap) return;
    await applySwap(slotIds, preWrap);
  };

  /** Box lines are one-per-slot; donate/remove only (no qty stepper — that is à-la-carte). */
  const removeCoalesced = async (
    group: ReturnType<typeof coalesceLinesByItemId>[number]
  ) => {
    if (locked) return;
    await persist(removeCoalescedGroup(lineItems, group));
  };

  const toggleSurprise = async (slotId: string) => {
    if (locked) return;
    const next = lineItems.map((li) =>
      li.slotId === slotId ? { ...li, isSurprise: !(li.isSurprise ?? defaultIsSurprise(li.slotId)) } : li
    );
    await persist(next);
  };

  const currentVoterId =
    isChildProfile && activeChild ? activeChild.id : user?.uid ?? 'guest';

  const handleToggleVote = async (slotId: string, itemId: string) => {
    const voter = buildVoter(
      isChildProfile && activeChild
        ? { type: 'child', childId: activeChild.id }
        : { type: 'parent' },
      user?.uid ?? 'guest',
      profile?.displayName ?? 'Grown-up',
      activeChild?.id,
      activeChild?.name
    );
    if (!voter) return;
    const next = toggleSlotVote(slotVotes, slotId, itemId, voter);
    await persistSlotVotes(next);
  };

  const voteOptionsFor = (li: BoxLineItem): CatalogItem[] => {
    const current = catalog.find((c) => c.id === li.itemId);
    const alts = swapOptionsBySlot[li.slotId] ?? [];
    const merged = [current, ...alts].filter(Boolean) as CatalogItem[];
    return merged.filter((opt, idx, arr) => arr.findIndex((o) => o.id === opt.id) === idx);
  };

  const kidVotableSlots = useMemo(() => {
    if (!isChildProfile || !activeChild?.id) return [];
    return lineItems.filter((li) => {
      if (li.childId !== activeChild.id) return false;
      if (!isVotablePerKidSlot(li.slotId)) return false;
      const wrapped =
        isWrappableSlot(li.slotId) && !!(li.isSurprise ?? defaultIsSurprise(li.slotId));
      return !wrapped;
    });
  }, [isChildProfile, activeChild?.id, lineItems]);

  const kidAllWrapped = useMemo(() => {
    if (!isChildProfile || !activeChild?.id) return false;
    const kidSlots = lineItems.filter(
      (li) => li.childId === activeChild.id && isVotablePerKidSlot(li.slotId)
    );
    if (kidSlots.length === 0) return false;
    return kidSlots.every(
      (li) =>
        isWrappableSlot(li.slotId) && !!(li.isSurprise ?? defaultIsSurprise(li.slotId))
    );
  }, [isChildProfile, activeChild?.id, lineItems]);

  const setKeepOrToss = async (slotId: string, value: 'keep' | 'toss') => {
    if (locked) return;
    const next = lineItems.map((li) => (li.slotId === slotId ? { ...li, keepOrToss: value } : li));
    await persist(next);
  };

  const goToCheckout = () => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return;
    }
    if (openOrder) {
      navigation.navigate('Orders');
      return;
    }
    navigation.navigate('Checkout');
  };

  const canUpdateCommittedOrder =
    !!openOrder &&
    (openOrder.status === 'committed' || openOrder.status === 'pending') &&
    !locked;

  const orderDirty = useMemo(() => {
    if (!canUpdateCommittedOrder || !openOrder) return false;
    return lineItemsFingerprint(lineItems) !== lineItemsFingerprint(openOrder.lineItems ?? []);
  }, [canUpdateCommittedOrder, openOrder, lineItems]);

  const committedSubtotalCents = useMemo(() => {
    if (!openOrder) return 0;
    if (typeof openOrder.subtotalCents === 'number') return openOrder.subtotalCents;
    return totalCents(openOrder.lineItems ?? [], boxPriceCents);
  }, [openOrder, boxPriceCents]);

  const orderDeltaCents = useMemo(() => {
    if (!orderDirty) return 0;
    return totalCents(lineItems, boxPriceCents) - committedSubtotalCents;
  }, [orderDirty, lineItems, boxPriceCents, committedSubtotalCents]);

  const saveOrderUpdates = async () => {
    if (savingOrder) return;
    if (!household?.id) {
      notifyUser('Couldn’t update order', 'Your account isn’t linked to a household yet. Refresh and try again.');
      return;
    }
    if (!openOrder || !orderDirty) return;
    setSavingOrder(true);
    try {
      await updatePilotBoxOrder(household.id, openOrder.id);
      await refreshOrders();
    } catch (e) {
      console.error('updatePilotBoxOrder failed', e);
      notifyUser('Couldn’t update order', formatCallableError(e));
    } finally {
      setSavingOrder(false);
    }
  };

  const discardOrderChanges = async () => {
    if (!openOrder || !orderDirty || savingOrder) return;
    await persist(
      (openOrder.lineItems ?? []).map((li) => ({
        ...li,
        quantity: li.quantity ?? 1,
      }))
    );
  };

  const openProduct = (itemId: string) => {
    navigation.navigate('CatalogProduct', { slug: itemId });
  };

  const onUpsellPress = (item: CatalogItem) => {
    if (guestViewOnly) {
      requireAuthToCustomize('signup');
      return;
    }
    openProduct(item.id);
  };

  const boxItemIds = useMemo(
    () => new Set(lineItems.map((li) => li.itemId)),
    [lineItems]
  );

  const upsellsBySection = useMemo(() => {
    const map = {} as Record<BoxDisplaySectionId, CatalogItem[]>;
    for (const section of BOX_DISPLAY_SECTIONS) {
      map[section.id] = resolveSectionUpsellItems(section.id, catalog, boxItemIds, 8);
    }
    return map;
  }, [catalog, boxItemIds]);

  const renderSection = (sectionId: BoxDisplaySectionId, isLast = false) => {
    const rawItems = grouped[sectionId] ?? [];
    const isPresents = sectionId === 'presents';
    const cardItems = fullCardLinesForSection(sectionId, rawItems);
    const coalesced = coalesceLinesByItemId(cardItems);
    const showPresentsChecklist = isPresents && !isChildProfile && hasPresentsChecklist;

    if (!coalesced.length && !showPresentsChecklist && !isChildProfile) return null;
    if (isChildProfile && !rawItems.length && sectionId !== 'presents') return null;

    const sectionSealed = sealedSectionIds?.includes(sectionId) ?? false;
    const showUpsells = !isChildProfile && !sectionSealed;

    return (
      <BoxDetailSectionBlock
        key={sectionId}
        sectionId={sectionId}
        onLayout={onSectionLayout(sectionId)}
        onSectionRef={registerSection}
        isLast={isLast}
        showUpsells={showUpsells}
        upsellItems={showUpsells ? upsellsBySection[sectionId] : undefined}
        onUpsellPress={showUpsells ? onUpsellPress : undefined}
        trailing={
          showPresentsChecklist ? (
            <PresentsWrappableList
              lineItems={lineItems}
              catalog={catalog}
              childrenProfiles={children}
              selectedItemIds={wrapSelectedIds}
              onToggleWrapSelection={(itemId) => {
                const next = new Set(wrapSelectedIds);
                if (next.has(itemId)) next.delete(itemId);
                else next.add(itemId);
                void persistWrapSelection([...next]);
              }}
            />
          ) : null
        }
      >
        {coalesced.map((group) => {
          const li = group.primary;
          const item = catalog.find((c) => c.id === li.itemId);
          const names = childNamesForLines(group.lines, children);
          const memberValueCents = item
            ? resolveCatalogDisplayPrices(item).memberCents
            : 0;
          const presentMeta = formatBoxItemStatusMeta(
            group.unitCents,
            names,
            formatCatalogDollars,
            memberValueCents,
            resolveBoxItemAttributionKind(group.lines, item)
          );
          const wrapped =
            isChildProfile &&
            isWrappableSlot(li.slotId) &&
            !!(li.isSurprise ?? defaultIsSurprise(li.slotId));
          const showChildWrapped = wrapped;
          const showVotes =
            !PILOT_PARENT_ONLY &&
            group.lines.some((line) => isVotablePerKidSlot(line.slotId)) &&
            (!showKidBoxUi || group.lines.some((line) => line.childId === activeChild?.id)) &&
            !(showKidBoxUi && showChildWrapped);

          if (isChildProfile && !group.lines.some((line) => line.childId === activeChild?.id)) {
            return null;
          }
          if (
            isChildProfile &&
            !group.lines.some((line) => isVotablePerKidSlot(line.slotId))
          ) {
            return null;
          }

          const voteLine =
            group.lines.find(
              (line) =>
                isVotablePerKidSlot(line.slotId) &&
                (!showKidBoxUi || line.childId === activeChild?.id)
            ) ?? li;

          const isWrappingPaper =
            isWrapControlSlot(li.slotId) &&
            (catalogSlotId(li.slotId) === 'wrapping-paper' ||
              catalogSlotId(li.slotId) === 'wrapping' ||
              /wrapping.?paper/i.test(`${li.itemId} ${li.label ?? ''} ${item?.name ?? ''}`));

          return (
            <View key={group.key}>
              {showChildWrapped ? (
                <WrappedGiftPlaceholder />
              ) : (
                <>
                  {!isChildProfile ? (
                    <BoxItemRow
                      li={li}
                      item={item}
                      meta={presentMeta}
                      locked={locked || sectionSealed}
                      swapOptions={swapOptionsBySlot[li.slotId] ?? []}
                      onSwap={(opt) =>
                        void applySwap(
                          group.lines.map((line) => line.slotId),
                          opt
                        )
                      }
                      swapLabel={isWrappingPaper ? 'pre-wrap presents instead' : undefined}
                      onPrimarySwapAction={
                        isWrappingPaper
                          ? () =>
                              void swapToPreWrap(group.lines.map((line) => line.slotId))
                          : undefined
                      }
                      onToggleSurprise={
                        !PILOT_PARENT_ONLY && isParentProfile && isWrappableSlot(li.slotId)
                          ? () => void toggleSurprise(li.slotId)
                          : undefined
                      }
                      onSetKeepOrToss={(value) => void setKeepOrToss(li.slotId, value)}
                      decrementMode={group.unitCents === 0 ? 'donate' : 'remove'}
                      onRemove={() => void removeCoalesced(group)}
                      onOpenProduct={() => openProduct(li.itemId)}
                      formatPrice={formatDollars}
                    />
                  ) : (
                    <View style={styles.childItemHeader}>
                      <Text style={styles.childItemTitle}>
                        {item?.name ?? li.label ?? 'Your pick'}
                      </Text>
                      {presentMeta ? (
                        <Text style={styles.childItemMeta}>{presentMeta}</Text>
                      ) : null}
                    </View>
                  )}
                  {showVotes ? (
                    <BoxSlotVoteRow
                      slotId={voteLine.slotId}
                      slotVotes={slotVotes}
                      options={voteOptionsFor(voteLine)}
                      currentItemId={voteLine.itemId}
                      currentVoterId={currentVoterId}
                      onToggleVote={(itemId) => void handleToggleVote(voteLine.slotId, itemId)}
                      topPickItemId={
                        isParentProfile ? topPickItemId(slotVotes, voteLine.slotId) : null
                      }
                      topPickItemName={
                        isParentProfile
                          ? catalog.find(
                              (c) => c.id === topPickItemId(slotVotes, voteLine.slotId)
                            )?.name
                          : undefined
                      }
                      onApplyTopPick={
                        isParentProfile && !locked && !guestViewOnly
                          ? () => {
                              const pickId = topPickItemId(slotVotes, voteLine.slotId);
                              const pick = catalog.find((c) => c.id === pickId);
                              if (pick) {
                                void applySwap(
                                  group.lines.map((line) => line.slotId),
                                  pick
                                );
                              }
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </>
              )}
            </View>
          );
        })}
      </BoxDetailSectionBlock>
    );
  };

  if (sessionLoading || loading || draftLoading || guestNeedsOnboarding) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav>
        <View style={styles.centered}>
          <BrandLoadingMark color={colors.brand} />
        </View>
      </StorefrontChrome>
    );
  }

  const hasOwnBox = lineItems.length > 0 || !!openOrder;
  if (user && !guestViewOnly && !hasOwnBox) {
    return (
      <StorefrontChrome bodyMode="fill" hideServicesNav>
        <WebContentPanel flush={isDesktop} centerDesktop={isDesktop} omitDesktopTopPadding={isDesktop}>
          <View style={[styles.centered, styles.emptyOwnBox]}>
            <Text style={styles.emptyOwnBoxTitle}>You don&apos;t have a box yet</Text>
            <Text style={styles.emptyOwnBoxBody}>
              Gifts you send live under Orders. Start here when you&apos;re ready to build a Hanukkah
              box for your household.
            </Text>
            <TouchableOpacity
              style={styles.emptyOwnBoxCta}
              onPress={() => {
                if (!user) {
                  startBuildBox();
                  return;
                }
                navigation.navigate('StorefrontHome');
              }}
            >
              <Text style={styles.emptyOwnBoxCtaText}>Browse the store</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyOwnBoxLink} onPress={() => navigation.navigate('Orders')}>
              <Text style={styles.emptyOwnBoxLinkText}>View your orders</Text>
            </TouchableOpacity>
          </View>
        </WebContentPanel>
      </StorefrontChrome>
    );
  }

  const subtotal = totalCents(lineItems, boxPriceCents);
  const kidsCount = Math.max(1, children.length);
  const chargeableExtras = extraLineItems.reduce((s, li) => s + li.unitCents * li.quantity, 0);
  const chargeableAlaCarte = alaCarteItems.reduce((s, li) => s + li.unitCents * li.quantity, 0);

  const lockBanner = locked && lockAt ? (
    <Text style={[styles.lockBanner, styles.lockBannerClosed]}>
      Customization closed. Contact support to change your box.
    </Text>
  ) : null;

  const parentScrollHeader = (
    <>
      <BoxDetailToolbar
        lockAt={lockAt}
        now={now}
        hideBack
        title="Your Hanukkah Box"
        startsOn={startsOn}
        estimatedDeliveryBy={estimatedDeliveryBy}
        align="center"
        calendarVariant="inlineLink"
      />
      {!guestViewOnly && lockBanner ? (
        <View style={detailStyles.headerExtras}>{lockBanner}</View>
      ) : null}
    </>
  );

  const kidScrollHeader = (
    <View style={styles.pageHeader}>
      <Text style={styles.title}>{`${activeChild?.name?.trim() || 'Your'} picks`}</Text>
      <Text style={styles.headerMeta}>Tap 👍 on what you like — a grown-up picks at checkout</Text>
    </View>
  );

  const scrollHeader = isChildProfile ? kidScrollHeader : parentScrollHeader;

  const sections = visibleSectionIds.map((id, index) =>
    renderSection(id, index === visibleSectionIds.length - 1),
  );

  const summaryPanel = (
    <View
      style={[
        styles.summaryCard,
        Platform.OS === 'web'
          ? { boxShadow: shadowsWeb.md }
          : shadows.md,
      ]}
    >
      <View style={styles.summaryBreakdown}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>
            {kidsCount === 1 ? 'Base box (1 kid)' : `Base box (${kidsCount} kids)`}
          </Text>
          <Text style={styles.summaryValue}>{formatDollars(boxPriceCents)}</Text>
        </View>
        {chargeableExtras > 0 ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Add-ons</Text>
            <Text style={styles.summaryValue}>{formatDollars(chargeableExtras)}</Text>
          </View>
        ) : null}
        {chargeableAlaCarte > 0 ? (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>À la carte</Text>
            <Text style={styles.summaryValue}>{formatDollars(chargeableAlaCarte)}</Text>
          </View>
        ) : null}
        <View style={styles.summaryTotalItem}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatDollars(subtotal)}</Text>
          {guestViewOnly ? <GuestBoxAuthBanner /> : null}
        </View>
        {orderDirty && orderDeltaCents !== 0 ? (
          <Text style={styles.orderDeltaCopy} accessibilityRole="summary">
            {orderDeltaCents > 0
              ? `This update adds ${formatDollars(orderDeltaCents)} to your box. You’ll be charged the new total when it ships.`
              : `This update reduces your box by ${formatDollars(Math.abs(orderDeltaCents))}. You’ll be charged the new total when it ships.`}
          </Text>
        ) : null}
        {guestViewOnly ? (
          <View style={styles.guestCtaRow}>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                styles.guestPrimaryCta,
                (hovered || pressed) && styles.checkoutCtaHover,
              ]}
              onPress={() => requireAuthToCustomize('signup')}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) => (
                <Text
                  style={[
                    styles.checkoutText,
                    (hovered || pressed) && styles.checkoutTextHover,
                  ]}
                >
                  Sign up
                </Text>
              )}
            </Pressable>
            <TouchableOpacity
              onPress={() => requireAuthToCustomize('signin')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.guestSignIn}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : orderDirty ? (
          <View style={styles.orderUpdateCtaRow}>
            <TouchableOpacity
              onPress={() => void discardOrderChanges()}
              disabled={savingOrder}
              accessibilityRole="button"
              accessibilityLabel="Cancel changes"
              hitSlop={8}
            >
              <Text style={[styles.guestSignIn, savingOrder && styles.checkoutCtaDisabled]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Pressable
              style={({ pressed, hovered }) => [
                styles.checkoutCta,
                styles.guestPrimaryCta,
                (hovered || pressed) && styles.checkoutCtaHover,
                (savingOrder || locked) && styles.checkoutCtaDisabled,
              ]}
              onPress={() => void saveOrderUpdates()}
              disabled={savingOrder || locked}
              accessibilityRole="button"
            >
              {({ pressed, hovered }) => (
                <Text
                  style={[
                    styles.checkoutText,
                    (hovered || pressed) && styles.checkoutTextHover,
                  ]}
                >
                  {savingOrder ? 'Saving…' : 'Save and update box'}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed, hovered }) => [
              styles.checkoutCta,
              (hovered || pressed) && styles.checkoutCtaHover,
              locked && styles.checkoutCtaDisabled,
            ]}
            onPress={goToCheckout}
            disabled={locked || lineItems.length === 0}
            accessibilityRole="button"
          >
            {({ pressed, hovered }) => (
              <Text
                style={[
                  styles.checkoutText,
                  (hovered || pressed) && styles.checkoutTextHover,
                ]}
              >
                {openOrder
                  ? 'View order status'
                  : cardOnFile
                    ? 'Review shipping'
                    : 'Add payment & shipping'}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );

  const kidEmptyState =
    isChildProfile && (kidVotableSlots.length === 0 || kidAllWrapped) ? (
      <View style={styles.kidEmptyCard}>
        <Text style={styles.kidEmptyTitle}>
          {kidAllWrapped ? 'All your gifts are wrapped surprises!' : 'Nothing to vote on yet'}
        </Text>
        <Text style={styles.kidEmptyBody}>
          {kidAllWrapped
            ? 'A grown-up wrapped your gifts — you\'ll see them on Hanukkah!'
            : 'Ask a grown-up to add your stories and gifts to the box.'}
        </Text>
      </View>
    ) : null;

  const scrollBody = (
    <>
      {scrollHeader}
      {kidEmptyState}
      {kidEmptyState ? null : sections}
    </>
  );

  const showSummaryFloat = !isChildProfile;
  const floatBottom = Math.max(insets.bottom, spacing.md);

  // `null` keeps primary services nav and omits the category bar; a node
  // replaces only the black secondary bar with practice section links.
  const servicesSlot =
    !isChildProfile && visibleSectionIds.length > 0 ? (
      <StickySectionNav
        activeSection={activeSection}
        onSelect={scrollToSection}
        sectionIds={visibleSectionIds}
        variant="services"
      />
    ) : null;

  return (
    <StorefrontChrome bodyMode="fill" servicesSlot={servicesSlot}>
      <View style={styles.pageRoot}>
        <WebContentPanel
          flush
          centerDesktop
          omitDesktopTopPadding
          gutter={!isDesktop}
          style={styles.panel}
        >
          <View style={styles.scrollHost} testID="box-scroll-host">
            <ScrollView
              ref={scrollRef}
              style={[styles.root, isDesktop && styles.desktopRoot]}
              contentContainerStyle={[
                isDesktop ? styles.desktopScrollContent : detailStyles.scrollContent,
                showSummaryFloat
                  ? {
                      paddingBottom: SUMMARY_FLOAT_CLEARANCE + floatBottom,
                    }
                  : null,
              ]}
              onScroll={onScroll}
              scrollEventThrottle={16}
              {...(Platform.OS === 'web'
                ? ({ className: 'gj-box-scroll', testID: 'box-vertical-scroll' } as object)
                : null)}
            >
              <View
                style={[
                  isDesktop && styles.desktopShell,
                  isDesktop ? { maxWidth: widePanelMaxWidth } : null,
                ]}
                ref={contentRef}
                collapsable={false}
              >
                {scrollBody}
              </View>
            </ScrollView>
          </View>
        </WebContentPanel>
        {showSummaryFloat ? (
          <View
            style={[styles.summaryFloat, { bottom: floatBottom }]}
            pointerEvents="box-none"
            testID="box-order-summary-float"
          >
            <View style={styles.summaryFloatInner}>
              {summaryPanel}
            </View>
          </View>
        ) : null}
      </View>
    </StorefrontChrome>
  );
}

function createMyBoxStyles(colors: SemanticColors, isDesktop = false) {
  return StyleSheet.create({
  pageRoot: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
  },
  root: { flex: 1, flexBasis: 0, minHeight: 0, backgroundColor: colors.bgPrimary },
  panel: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
    ...(Platform.OS === 'web' ? ({ overflow: 'hidden' as const } as object) : null),
  },
  scrollHost: {
    flex: 1,
    flexBasis: 0,
    width: '100%',
    minHeight: 0,
    overflow: 'hidden' as const,
    ...(Platform.OS === 'web' ? ({ height: '100%' } as object) : null),
  },
  desktopRoot: {
    flex: 1,
    flexBasis: 0,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.bgPrimary,
  },
  desktopScrollContent: {
    flexGrow: 1,
    paddingBottom: SUMMARY_FLOAT_CLEARANCE,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  desktopShell: {
    width: '100%',
    alignSelf: 'center',
    // Title top gap comes from toolbar paddingTop (equal to lock→divider / divider→section).
    paddingTop: 0,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' as const } as object) : null),
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyOwnBox: {
    padding: spacing.lg,
    maxWidth: 420,
    alignSelf: 'center',
  },
  emptyOwnBoxTitle: {
    fontSize: typography.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyOwnBoxBody: {
    marginTop: spacing.sm,
    fontSize: typography.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyOwnBoxCta: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.logoDark,
  },
  emptyOwnBoxCtaText: {
    color: colors.bgPrimary,
    fontWeight: '700',
    fontSize: typography.md,
  },
  emptyOwnBoxLink: { marginTop: spacing.md },
  emptyOwnBoxLinkText: {
    color: colors.brand,
    fontWeight: '600',
    fontSize: typography.md,
  },
  pageHeader: { alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: typography.titleLg, fontWeight: '600', textAlign: 'center' },
  headerMeta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 4, textAlign: 'center' },
  kidEmptyCard: {
    marginHorizontal: MOBILE_GUTTER,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
  },
  kidEmptyTitle: { fontSize: typography.xl, fontWeight: '700', color: colors.textPrimary },
  kidEmptyBody: {
    fontSize: typography.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  childItemHeader: { paddingVertical: spacing.sm },
  childItemTitle: { fontSize: typography.lg, fontWeight: '700', color: colors.textPrimary },
  childItemMeta: { fontSize: typography.sm, color: colors.goldMuted, marginTop: 2 },
  lockBanner: {
    backgroundColor: colors.brandLight,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    fontSize: typography.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  lockBannerClosed: { color: colors.textPrimary, fontWeight: '600' },
  summaryFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: isDesktop ? spacing.lg : 0,
    zIndex: 30,
  },
  summaryFloatInner: {
    width: '100%',
    maxWidth: isDesktop ? 960 : undefined,
    paddingHorizontal: isDesktop ? 0 : spacing.sm,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.logoDark,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.goldMuted,
  },
  summaryBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  summaryLabel: { fontSize: typography.sm, color: colors.goldMuted, letterSpacing: -0.22 },
  summaryValue: { fontSize: typography.sm, fontWeight: '600', color: colors.textInverse, letterSpacing: -0.22 },
  summaryTotalItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    flexGrow: 1,
    paddingLeft: spacing.xs,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.goldMuted,
    minWidth: 0,
  },
  totalLabel: { fontSize: typography.md, fontWeight: '600', color: colors.textInverse, letterSpacing: -0.22 },
  totalValue: { fontSize: typography.md, fontWeight: '700', color: colors.brand, letterSpacing: -0.22 },
  guestCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  orderUpdateCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  orderDeltaCopy: {
    width: '100%',
    fontSize: typography.sm,
    lineHeight: 18,
    color: colors.goldMuted,
    letterSpacing: -0.22,
    marginTop: spacing.xs,
  },
  guestPrimaryCta: {
    marginLeft: 0,
  },
  guestSignIn: {
    fontWeight: '600',
    fontSize: typography.sm,
    color: colors.brand,
    letterSpacing: -0.22,
  },
  checkoutCta: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brand,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transitionProperty: 'background-color, border-color',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-in-out',
        } as object)
      : null),
  },
  checkoutCtaHover: {
    backgroundColor: colors.brand,
  },
  checkoutCtaDisabled: { opacity: 0.5 },
  checkoutText: {
    fontWeight: '700',
    fontSize: typography.sm,
    color: colors.brand,
    letterSpacing: -0.22,
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'color',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease-in-out',
        } as object)
      : null),
  },
  checkoutTextHover: { color: colors.logoDark },
  });
}
