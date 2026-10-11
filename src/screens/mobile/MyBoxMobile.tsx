import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { BOX_DISPLAY_SECTIONS, type BoxDisplaySectionId } from '../../constants/boxDisplaySections';
import {
  childNamesForLines,
  coalesceLinesByItemId,
  formatBoxItemStatusMeta,
  fullCardLinesForSection,
  giftBadgeLabelForLines,
  bookBadgeLabelForLines,
  resolveBoxItemAttributionKind,
  isWrapControlSlot,
  type CoalescedBoxLine,
} from '../../components/box/boxLineDisplay';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { chargeableLineTotal, resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
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

type Editing = ReturnType<typeof useMyBoxEditing>;

type Props = {
  editing: Editing;
  navigation: StackNavigationProp<MainStackParamList>;
};

type Sheet =
  | { kind: 'tradition'; sectionId: BoxDisplaySectionId }
  | { kind: 'product'; item: CatalogItem; group: CoalescedBoxLine | null; sectionId: BoxDisplaySectionId }
  | { kind: 'receipt' }
  | { kind: 'donated' }
  | null;

const SECTION_ICON: Record<BoxDisplaySectionId, (typeof icons)[keyof typeof icons]> = {
  candles: icons.menorah,
  dreidel: icons.dice,
  food: icons.utensils,
  story: icons.book,
  presents: icons.gift,
};

const SHORT: Record<BoxDisplaySectionId, string> = { candles: 'Candles', dreidel: 'Dreidel', food: 'Eat', story: 'Story', presents: 'Gifts' };

/**
 * My Box for the phone (mockups box-v3.html), on the same useMyBoxEditing hook as
 * desktop. Title and lock line, the small box summary, the not-held line, tradition
 * chips, one section per tradition with whole-row taps, the might-like shelf, and the
 * white sticky bar. Sheets: tradition (pick, alternatives, add-ons), product card,
 * receipt, donated items.
 */
export function MyBoxMobile({ editing: e, navigation }: Props) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [active, setActive] = useState<BoxDisplaySectionId>('candles');
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<BoxDisplaySectionId, number>>>({});
  const byId = useMemo(() => new Map(e.catalog.map((c) => [c.id, c])), [e.catalog]);
  const kids = e.children;
  const kidName = (id?: string | null) => (id ? kids.find((c) => c.id === id)?.name?.trim() || 'your kid' : null);

  const extras = chargeableLineTotal(e.lineItems);
  const total = e.boxPriceCents + extras;
  const lockShort = lockShortLabel(e.lockAt);
  const daysLeft = daysUntilLock(e.lockAt);
  const donatedValue = e.donatedItems.reduce((t, d) => t + resolveCatalogDisplayPrices(d.item).memberCents * d.missing, 0);

  const rowsFor = useCallback(
    (sectionId: BoxDisplaySectionId) => coalesceLinesByItemId(fullCardLinesForSection(sectionId, e.grouped[sectionId] ?? [])),
    [e.grouped]
  );

  const thumbs: BoxThumb[] = useMemo(() => {
    const out: BoxThumb[] = [];
    for (const s of BOX_DISPLAY_SECTIONS) {
      for (const g of rowsFor(s.id)) {
        out.push({
          id: `${s.id}:${g.itemId}`,
          imageUrl: primaryPhoto(byId.get(g.itemId)),
          count: g.quantity > 1 ? g.quantity : undefined,
          mine: g.unitCents > 0,
          onPress: () => setSheet({ kind: 'tradition', sectionId: s.id }),
        });
      }
    }
    return out;
  }, [rowsFor, byId]);
  const thingCount = thumbs.length;

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
    formatBoxItemStatusMeta(
      g.unitCents,
      childNamesForLines(g.lines, kids),
      formatCatalogDollars,
      item ? resolveCatalogDisplayPrices(item).memberCents : 0,
      resolveBoxItemAttributionKind(g.lines, item),
      g.quantity,
      g.includedQuantity
    );

  const quantity = (g: CoalescedBoxLine, delta: 1 | -1, sectionId: BoxDisplaySectionId) => {
    const item = byId.get(g.itemId);
    void e.changeBoxQuantity(g, delta, sectionId);
    if (delta === -1 && g.quantity <= 1 && g.unitCents === 0 && item) {
      setToast({ message: `${item.name} donated to a family who couldn't otherwise celebrate`, action: { label: 'Undo', onPress: () => void e.restoreDonated(item.id) } });
    }
  };

  const addItem = async (item: CatalogItem, sectionId: BoxDisplaySectionId) => {
    const free = (e.freeAddOptionsBySection[sectionId] ?? []).some((i) => i.id === item.id);
    if (free) await e.addFreeItemToEmptySlot(sectionId, item);
    else {
      e.setProductModalSection(sectionId);
      await e.modalAddToBox(item);
    }
    setToast({ message: `Added ${item.name}`, action: { label: 'Undo', onPress: () => void e.modalRemoveFromBox(item) } });
  };

  const Row = ({ g, sectionId }: { g: CoalescedBoxLine; sectionId: BoxDisplaySectionId }) => {
    const item = byId.get(g.itemId);
    const badge = giftBadgeLabelForLines(g.lines, kids) ?? bookBadgeLabelForLines(g.lines, kids);
    const meta = metaFor(g, item);
    const atFloor = g.quantity <= 1;
    const donate = atFloor && g.unitCents === 0;
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
            {badge ? `${badge}${meta ? ` · ${meta}` : ''}` : meta || (g.unitCents > 0 ? `Added · ${formatCatalogDollars(g.unitCents)}` : 'Included')}
          </Text>
        </View>
        {!e.locked ? (
          <View style={styles.stepper}>
            <Pressable onPress={() => quantity(g, -1, sectionId)} accessibilityRole="button" accessibilityLabel={atFloor ? (donate ? 'Donate' : 'Remove') : 'Decrease quantity'} style={styles.stepBtn} hitSlop={6}>
              {donate ? <Icon icon={icons.gift} size={13} color={m.goldDark} /> : <Text style={styles.stepText}>−</Text>}
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

  const section = (s: (typeof BOX_DISPLAY_SECTIONS)[number]) => {
    const rows = rowsFor(s.id);
    const adds = (e.upsellsBySection[s.id] ?? []).slice(0, 6);
    return (
      <View key={s.id} onLayout={(ev) => (sectionY.current[s.id] = ev.nativeEvent.layout.y)} style={styles.section}>
        <View style={styles.sectionHead}>
          <Icon icon={SECTION_ICON[s.id]} size={16} color={m.goldDark} />
          <Text style={mType.h2}>{s.title}</Text>
        </View>
        <Text style={[mType.small, { color: m.body, marginTop: 4, marginBottom: 6 }]} numberOfLines={3}>
          {s.description.split('\n')[0]}
        </Text>
        {rows.length ? rows.map((g) => <Row key={g.key} g={g} sectionId={s.id} />) : <Text style={[mType.small, { paddingVertical: 10 }]}>Nothing here yet.</Text>}
        {!e.locked ? (
          <Pressable onPress={() => setSheet({ kind: 'tradition', sectionId: s.id })} accessibilityRole="button" style={styles.more}>
            <Text style={styles.moreText}>{rows.length ? 'Swap or add' : 'Add something'}</Text>
            <View style={styles.minis}>
              {adds.slice(0, 3).map((it) => (
                <View key={it.id} style={styles.mini}>
                  <BoxItemImage size={26} imageUrl={it.imageUrl} itemId={it.id} />
                </View>
              ))}
            </View>
            <Text style={styles.chev}>›</Text>
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
    const adds = (e.upsellsBySection[sectionId] ?? []).filter((it) => !rows.some((g) => g.itemId === it.id));
    const freeIds = new Set((e.freeAddOptionsBySection[sectionId] ?? []).map((i) => i.id));
    return (
      <MobileSheet
        visible
        onClose={() => setSheet(null)}
        title={s.title}
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
          return (
            <View key={g.key} style={styles.pickBlock}>
              <View style={styles.pick}>
                <View style={[styles.rowImage, styles.rowImageMine]}>
                  <BoxItemImage size={64} imageUrl={item?.imageUrl} itemId={g.itemId} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item?.name ?? g.itemId}</Text>
                  <Text style={styles.rowMeta}>{metaFor(g, item) || 'In your box'}</Text>
                </View>
                {!e.locked ? (
                  <View style={styles.stepper}>
                    <Pressable onPress={() => quantity(g, -1, sectionId)} accessibilityRole="button" accessibilityLabel={g.quantity <= 1 ? (g.unitCents === 0 ? 'Donate' : 'Remove') : 'Decrease quantity'} style={styles.stepBtn}>
                      {g.quantity <= 1 && g.unitCents === 0 ? <Icon icon={icons.gift} size={13} color={m.goldDark} /> : <Text style={styles.stepText}>−</Text>}
                    </Pressable>
                    <Text style={styles.stepQty}>{g.quantity}</Text>
                    <Pressable onPress={() => quantity(g, 1, sectionId)} accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.stepBtn}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {wrapping && g.unitCents === 0 && !e.locked ? (
                <MobileButton label="We wrap the presents instead" variant="secondary" height={40} style={{ marginTop: 10 }} onPress={() => { void e.swapToPreWrap(g.lines.map((l) => l.slotId)); setToast({ message: 'We’ll wrap the presents' }); }} />
              ) : null}
              {alts.length && !e.locked ? (
                <>
                  <Text style={styles.altHead}>Prefer a different one? Swapping is included.</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.altRow}>
                    {alts.slice(0, 6).map((o) => (
                      <View key={o.id} style={styles.alt}>
                        <BoxItemImage size={104} imageUrl={o.imageUrl} itemId={o.id} />
                        <Text style={styles.altName} numberOfLines={2}>
                          {o.name}
                        </Text>
                        <MobileButton
                          label="Swap"
                          variant="secondary"
                          height={34}
                          onPress={() => {
                            void e.applySwap(g.lines.map((l) => l.slotId), o);
                            setToast({ message: `Swapped in ${o.name}`, action: item ? { label: 'Undo', onPress: () => void e.applySwap(g.lines.map((l) => l.slotId), item) } : undefined });
                          }}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </>
              ) : null}
            </View>
          );
        })}
        {adds.length && !e.locked ? (
          <>
            <Text style={[mType.h3, { marginTop: 8, marginBottom: 10 }]}>Add {rows.length ? 'on top' : 'something'}</Text>
            <View style={styles.addGrid}>
              {adds.slice(0, 8).map((it) => (
                <ProductTileMobile
                  key={it.id}
                  item={it}
                  width={150}
                  onPress={() => setSheet({ kind: 'product', item: it, group: null, sectionId })}
                  status={freeIds.has(it.id) ? { kind: 'inbox', text: 'Included' } : null}
                  action={{ label: freeIds.has(it.id) ? 'Add · included' : `Add · +${formatCatalogDollars(e.catalog.length ? priceToAdd(it) : 0)}`, onPress: () => void addItem(it, sectionId), variant: 'secondary' }}
                />
              ))}
            </View>
          </>
        ) : null}
      </MobileSheet>
    );
  };

  const priceToAdd = (it: CatalogItem) => {
    const { memberCents } = resolveCatalogDisplayPrices(it);
    return memberCents;
  };

  const productSheet = (item: CatalogItem, group: CoalescedBoxLine | null, sectionId: BoxDisplaySectionId) => {
    const alts = group && group.unitCents === 0 ? (e.swapOptionsBySlot[group.primary.slotId] ?? []).filter((o) => o.id !== group.itemId) : [];
    const desc = (item.description ?? '').trim();
    return (
      <MobileSheet
        visible
        onClose={() => setSheet(null)}
        titleAction={{ label: `‹ ${BOX_DISPLAY_SECTIONS.find((s) => s.id === sectionId)?.title ?? 'Back'}`, onPress: () => setSheet({ kind: 'tradition', sectionId }) }}
        footer={
          group ? (
            <View style={styles.sheetFoot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.footLabel}>{group.unitCents > 0 ? `Added · ${formatCatalogDollars(group.unitCents)} each` : 'In your box · included'}</Text>
                <Text style={styles.footTotal}>Quantity {group.quantity}</Text>
              </View>
              <MobileButton label="Done" onPress={() => setSheet(null)} height={46} style={{ width: 120 }} />
            </View>
          ) : (
            <MobileButton label={`Add to my box · ${(e.freeAddOptionsBySection[sectionId] ?? []).some((i) => i.id === item.id) ? 'included' : `+${formatCatalogDollars(priceToAdd(item))}`}`} onPress={() => { void addItem(item, sectionId); setSheet(null); }} />
          )
        }
      >
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.sheetPhoto} resizeMode="cover" /> : null}
        <Text style={[mType.h2, { marginTop: 14 }]} {...balanceProps}>
          {item.name}
        </Text>
        {group ? <Text style={[mType.smallDark, { marginTop: 4 }]}>{metaFor(group, item) || 'In your box'}</Text> : null}
        {desc ? <Text style={[mType.body, { marginTop: 10 }]}>{desc.length > 240 ? `${desc.slice(0, 237).trimEnd()}…` : desc}</Text> : null}
        <Pressable onPress={() => { setSheet(null); navigation.navigate('CatalogProduct', { slug: item.id }); }} accessibilityRole="button" style={{ marginTop: 10 }}>
          <Text style={styles.link}>See full details ›</Text>
        </Pressable>
        {alts.length && group && !e.locked ? (
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

  const receiptSheet = () => (
    <MobileSheet visible onClose={() => setSheet(null)} title="Your box" titleAction={{ label: 'Keep editing', onPress: () => setSheet(null) }} footer={<MobileButton label={`Checkout · ${formatCatalogDollars(total)}`} onPress={() => { setSheet(null); e.goToCheckout(); }} />}>
      {BOX_DISPLAY_SECTIONS.map((s) => {
        const rows = rowsFor(s.id);
        if (!rows.length) return null;
        return (
          <View key={s.id} style={styles.rcGroup}>
            <View style={styles.sectionHead}>
              <Icon icon={SECTION_ICON[s.id]} size={13} color={m.goldDark} />
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
        {donatedValue ? <Line label="Donated" value={formatCatalogDollars(donatedValue)} /> : null}
        <Line label="Shipping" value="Free" />
        <Line label="Total" value={formatCatalogDollars(total)} strong />
      </View>
    </MobileSheet>
  );

  const donatedSheet = () => (
    <MobileSheet visible onClose={() => setSheet(null)} title="Your donated items" footer={<MobileButton label="Done" variant="secondary" onPress={() => setSheet(null)} />}>
      <Text style={[mType.small, { marginBottom: 12 }]}>Unclaimed items go into Hanukkah kits for families who couldn't otherwise celebrate. Thank you.</Text>
      {e.donatedItems.map(({ item, missing }) => (
        <View key={item.id} style={styles.rcRow}>
          <BoxItemImage size={40} imageUrl={item.imageUrl} itemId={item.id} />
          <Text style={styles.rcName} numberOfLines={2}>
            {item.name}
            {missing > 1 ? ` ×${missing}` : ''}
          </Text>
          <MobileButton label="Restore" variant="secondary" height={34} style={{ width: 92 }} onPress={() => void e.restoreDonated(item.id)} accessibilityLabel={`Restore ${item.name} to your box`} />
        </View>
      ))}
    </MobileSheet>
  );

  return (
    <StorefrontChrome scrollRef={scrollRef} onPageScroll={onScroll}>
      <View style={{ paddingBottom: STICKY_BAR_CLEARANCE + 12 }}>
        <View style={styles.head}>
          <Text style={mType.h1}>Your Hanukkah box</Text>
          <Text style={[mType.body, { marginTop: 6 }]}>Everything for eight nights, picked for your family. Keep it as is, or change anything.</Text>
          <View style={styles.lockLine}>
            <Icon icon={icons.calendar} size={13} color={m.goldDark} />
            <Text style={styles.lockText}>
              {e.locked ? `Locked ${lockShort}` : `Change anything until ${lockShort}${daysLeft != null ? ` · ${daysLeft} days left` : ''}`}
            </Text>
          </View>
        </View>

        <View style={styles.pad}>
          <BoxSummary size="sm" title="In your box" sub={`${thingCount} things · ${formatCatalogDollars(total)}`} items={thumbs} link={<Pressable onPress={() => setSheet({ kind: 'receipt' })} accessibilityRole="button" hitSlop={8}><Text style={styles.link}>See list</Text></Pressable>} />
          {!e.cardOnFile && !e.openOrder ? (
            <Text style={styles.held}>
              {NOT_HELD_COPY}{' '}
              <Text style={styles.link} onPress={e.goToCheckout}>
                Add a card
              </Text>
            </Text>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {BOX_DISPLAY_SECTIONS.map((s) => (
            <Pressable key={s.id} onPress={() => jumpTo(s.id)} accessibilityRole="button" accessibilityState={{ selected: active === s.id }} style={[styles.chip, active === s.id && styles.chipOn]}>
              <Text style={[styles.chipText, active === s.id && styles.chipTextOn]}>{SHORT[s.id]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {BOX_DISPLAY_SECTIONS.map(section)}

        {mightLike.length ? (
          <View style={styles.like}>
            <Text style={mType.h2}>Other things you might like</Text>
            <Text style={[mType.small, { marginTop: 2, marginBottom: 12 }]}>Add them on top of your box.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {mightLike.map((it) => {
                const sectionId = BOX_DISPLAY_SECTIONS.find((s) => (e.upsellsBySection[s.id] ?? []).some((u) => u.id === it.id))?.id ?? 'presents';
                return <ProductTileMobile key={it.id} item={it} width={150} onPress={() => setSheet({ kind: 'product', item: it, group: null, sectionId })} action={{ label: `Add · +${formatCatalogDollars(priceToAdd(it))}`, onPress: () => void addItem(it, sectionId), variant: 'secondary' }} />;
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <StickyBar
        label={`Box ${formatCatalogDollars(e.boxPriceCents)}${extras ? ` + ${formatCatalogDollars(extras)}` : ''}${donatedValue ? ` · Donated ${formatCatalogDollars(donatedValue)}` : ''}`}
        total={`Total ${formatCatalogDollars(total)}`}
        onSummaryPress={() => setSheet(donatedValue && !extras ? { kind: 'donated' } : { kind: 'receipt' })}
        cta={{ label: e.openOrder ? 'Save changes' : 'Checkout', onPress: e.openOrder && e.hasSessionEdits ? () => void e.saveOrderUpdates() : e.goToCheckout, disabled: e.savingOrder, busy: e.savingOrder }}
        testID="mobile-box-bar"
      />
      {donatedValue ? (
        <Pressable onPress={() => setSheet({ kind: 'donated' })} accessibilityRole="button" accessibilityLabel={`Donated ${formatCatalogDollars(donatedValue)}`} style={styles.donatedChip}>
          <Text style={styles.donatedChipText}>Donated {formatCatalogDollars(donatedValue)} · see</Text>
        </Pressable>
      ) : null}

      {sheet?.kind === 'tradition' ? traditionSheet(sheet.sectionId) : null}
      {sheet?.kind === 'product' ? productSheet(sheet.item, sheet.group, sheet.sectionId) : null}
      {sheet?.kind === 'receipt' ? receiptSheet() : null}
      {sheet?.kind === 'donated' ? donatedSheet() : null}
      <MobileToast toast={toast} onDismiss={() => setToast(null)} />
    </StorefrontChrome>
  );
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
  head: { paddingHorizontal: mGutter, paddingTop: 20 },
  pad: { paddingHorizontal: mGutter, paddingTop: 16 },
  lockLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  lockText: { fontSize: 13, color: m.goldDark, ...mFont(400) },
  held: { fontSize: 12.5, color: m.goldDark, lineHeight: 17, marginTop: 10, ...mFont(400) },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  chips: { paddingHorizontal: mGutter, gap: 8, paddingVertical: 16 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipText: { fontSize: 13.5, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
  section: { paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: m.line },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowImage: { borderRadius: mRadius.md, overflow: 'hidden' },
  rowImageMine: { borderWidth: 2, borderColor: m.gold },
  rowName: { fontSize: 15, color: m.ink, lineHeight: 20, ...mFont(400) },
  rowMeta: { fontSize: 12.5, color: m.goldDark, marginTop: 2, lineHeight: 17, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 18, height: 36, backgroundColor: m.white },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark },
  stepQty: { minWidth: 16, textAlign: 'center', fontSize: 14, color: m.ink, ...mFont(500) },
  more: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, marginTop: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: m.gold, borderRadius: mRadius.md },
  moreText: { flex: 1, fontSize: 14, color: m.ink, ...mFont(400) },
  minis: { flexDirection: 'row' },
  mini: { marginLeft: -8, borderWidth: 2, borderColor: m.white, borderRadius: 8, overflow: 'hidden' },
  chev: { fontSize: 20, color: m.goldDark },
  like: { backgroundColor: m.beige, paddingLeft: mGutter, paddingVertical: 28, marginTop: 8 },
  sheetFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footLabel: { fontSize: 12, color: m.muted, ...mFont(300) },
  footTotal: { fontSize: 16, color: m.ink, ...mFont(500) },
  pickBlock: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: mRadius.md, backgroundColor: m.beige, borderWidth: 1.5, borderColor: m.gold },
  altHead: { fontSize: 13, color: m.muted, marginTop: 12, marginBottom: 8, ...mFont(400) },
  altRow: { gap: 10, paddingRight: 8 },
  alt: { width: 104, gap: 6 },
  altName: { fontSize: 12.5, color: m.ink, lineHeight: 16, minHeight: 32, ...mFont(400) },
  addGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sheetPhoto: { width: '100%', aspectRatio: 1, borderRadius: mRadius.lg, backgroundColor: m.img },
  rcGroup: { marginBottom: 14 },
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
  donatedChip: { position: Platform.OS === 'web' ? ('fixed' as unknown as 'absolute') : 'absolute', right: 16, bottom: 104, backgroundColor: m.beige, borderRadius: 14, paddingHorizontal: 12, height: 28, justifyContent: 'center', zIndex: 41 },
  donatedChipText: { fontSize: 12, color: m.goldDark, ...mFont(500) },
});
