import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { MobileButton } from '../../components/mobile/MobileButton';
import { m, mType, mFont } from '../../components/mobile/mobileTheme';
import { byId, primaryPhoto } from '../../components/mobile/catalogPhotos';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { formatDollars } from '../../services/box/buildDefaultBox';
import { orderItemName } from '../../components/orders/OrderPurchaseMedia';
import { giftInvitePaid, type UnifiedOrder } from '../../hooks/useUnifiedOrders';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';

export type MobileOrderAction = { label: string; onPress: () => void; busy?: boolean; secondary?: boolean; link?: boolean };

type Props = {
  orders: UnifiedOrder[];
  catalog: CatalogItem[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onBack: () => void;
  onOpenItem: (itemId: string) => void;
  actionsFor: (order: UnifiedOrder) => MobileOrderAction[];
};

const SHIPPED = '#3F6B3A';

function orderItems(o: UnifiedOrder): BoxLineItem[] {
  if (o.pilotOrder?.giftSurprise) return [];
  return [...(o.pilotOrder?.lineItems ?? []), ...(o.giftInvite?.lineItems ?? [])];
}

function moneyLine(o: UnifiedOrder): string {
  const total = formatDollars(o.totalCents);
  const st = o.pilotOrder?.status;
  if (o.giftInvite) return `${total} · ${giftInvitePaid(o.giftInvite) ? 'paid' : 'not paid yet'}`;
  if (st === 'pending' || st === 'committed') return `${total} · charged after the lock date`;
  if (st === 'cancelled') return `${total} · not charged`;
  return `${total} · paid`;
}

function shortDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Phone orders (mockups/account s=2): one row per order; tap a row for its details and actions. */
export function MobileOrdersBody(p: Props) {
  const catalogById = useMemo(() => byId(p.catalog), [p.catalog]);
  const year = new Date().getFullYear();
  const isPast = (o: UnifiedOrder) => {
    const ms = Date.parse(o.createdAt);
    return !Number.isNaN(ms) && new Date(ms).getFullYear() < year;
  };
  const hasPast = p.orders.some(isPast);
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = p.orders.filter((o) => (past ? isPast(o) : !isPast(o)));

  return (
    <View style={{ flex: 1, backgroundColor: m.white }}>
      <TaskHeader back={{ label: 'Account', onPress: p.onBack }} title="Orders" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Orders</Text>
        {hasPast ? (
          <View style={styles.chips}>
            <Chip label="This year" on={!past} onPress={() => setPast(false)} />
            <Chip label="Past years" on={past} onPress={() => setPast(true)} />
          </View>
        ) : null}
        {p.loading ? (
          <View style={styles.loading}><BrandLoadingMark /></View>
        ) : p.loadError ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <Text style={mType.body}>{p.loadError}</Text>
            <MobileButton label="Try again" variant="secondary" onPress={p.onRetry} />
          </View>
        ) : shown.length === 0 ? (
          <Text style={[mType.body, { marginTop: 16 }]}>
            {past ? 'Nothing from past years.' : 'No orders yet. When you set your box or buy something in the store, it shows up here.'}
          </Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {shown.map((o) => {
              const key = `${o.kind}-${o.id}`;
              const items = orderItems(o);
              const thumbs = items.slice(0, 3).map((li) => primaryPhoto(catalogById.get(li.itemId)));
              const expanded = open === key;
              const shipped = o.pilotOrder?.status === 'shipped' || o.pilotOrder?.status === 'delivered';
              const actions = p.actionsFor(o);
              const addr = o.pilotOrder?.shippingAddress;
              return (
                <View key={key} style={styles.order}>
                  <Pressable
                    onPress={() => setOpen(expanded ? null : key)}
                    accessibilityRole="button"
                    accessibilityLabel={o.title}
                    accessibilityState={{ expanded }}
                    style={styles.row}
                  >
                    {thumbs.length ? (
                      <View style={[styles.stack, { width: 52 + (thumbs.length - 1) * 38 }]}>
                        {thumbs.map((uri, i) => (
                          <View key={i} style={[styles.thumb, { left: i * 38, zIndex: 3 - i }]}>
                            {uri ? <Image source={{ uri }} style={styles.thumbImg} /> : null}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={[styles.thumb, styles.thumbIcon]}>
                        <Icon icon={o.kind === 'gift' ? icons.gift : icons.boxOpen} size={18} color={m.goldDark} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.title} numberOfLines={1}>{o.title}</Text>
                      <Text style={[styles.sub, shipped && { color: SHIPPED }]} numberOfLines={1}>{o.statusLabel}</Text>
                      <Text style={styles.sub} numberOfLines={1}>{moneyLine(o)}</Text>
                    </View>
                    <View style={expanded ? { transform: [{ rotate: '90deg' }] } : null}>
                      <Icon icon={icons.chevronRight} size={12} color={m.gold} />
                    </View>
                  </Pressable>
                  {expanded ? (
                    <View style={styles.detail}>
                      <Fact label="Ordered" value={shortDate(o.createdAt)} />
                      <Fact label="Order #" value={(o.pilotOrder?.id ?? o.giftInvite?.id ?? o.id).slice(0, 8).toUpperCase()} />
                      {o.recipientLabel ? <Fact label={o.kind === 'gift' ? 'Gifted to' : 'Ship to'} value={o.recipientLabel} /> : null}
                      {addr ? (
                        <Fact
                          label="Address"
                          value={`${addr.line1}${addr.line2 ? `, ${addr.line2}` : ''}, ${addr.city}, ${addr.stateProvince} ${addr.postalCode}`}
                        />
                      ) : null}
                      {o.trackingNumber ? <Fact label="Tracking" value={o.carrier ? `${o.carrier} · ${o.trackingNumber}` : o.trackingNumber} /> : null}
                      {o.giftInvite?.message ? <Text style={styles.message}>“{o.giftInvite.message}”</Text> : null}
                      {o.pilotOrder?.chargeFailureMessage ? (
                        <Text style={[mType.small, { color: m.warn }]}>Last charge attempt: {o.pilotOrder.chargeFailureMessage}</Text>
                      ) : null}
                      {items.length ? (
                        <View style={styles.items}>
                          {items.map((li) => {
                            const qty = Math.max(1, li.quantity ?? 1);
                            return (
                              <Pressable key={`${li.slotId}-${li.itemId}`} onPress={() => p.onOpenItem(li.itemId)} accessibilityRole="link" style={styles.item}>
                                <Text style={styles.itemName} numberOfLines={1}>{orderItemName(li, p.catalog)}</Text>
                                {qty > 1 ? <Text style={styles.itemQty}>×{qty}</Text> : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                      {actions.map((a) =>
                        a.link ? (
                          <Text key={a.label} style={styles.link} onPress={a.busy ? undefined : a.onPress} accessibilityRole="button">
                            {a.busy ? 'Working…' : a.label}
                          </Text>
                        ) : (
                          <MobileButton key={a.label} label={a.label} onPress={a.onPress} busy={a.busy} disabled={a.busy} variant={a.secondary ? 'secondary' : undefined} />
                        )
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export function MobileChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}
const Chip = MobileChip;

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 48 },
  h1: { fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: m.gold, justifyContent: 'center' },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipText: { fontSize: 13, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
  loading: { paddingVertical: 60, alignItems: 'center' },
  order: { borderBottomWidth: 1, borderBottomColor: m.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  stack: { height: 52, position: 'relative' },
  thumb: { position: 'absolute', top: 0, width: 52, height: 52, borderRadius: 8, backgroundColor: m.img, borderWidth: 2, borderColor: m.white, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  thumbIcon: { position: 'relative', backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, color: m.ink, marginBottom: 2, ...mFont(400) },
  sub: { fontSize: 13, lineHeight: 19, color: m.muted, ...mFont(300) },
  detail: { paddingBottom: 16, gap: 10 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 76, fontSize: 13, color: m.muted, ...mFont(400) },
  factValue: { flex: 1, fontSize: 13.5, color: m.ink, ...mFont(400) },
  message: { fontSize: 14, fontStyle: 'italic', color: m.body, ...mFont(300) },
  items: { backgroundColor: m.beige, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  item: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 8 },
  itemName: { flex: 1, fontSize: 14, color: m.ink, ...mFont(400) },
  itemQty: { fontSize: 13, color: m.muted, ...mFont(400) },
  link: { fontSize: 14, color: m.goldDark, textDecorationLine: 'underline', paddingVertical: 8, alignSelf: 'flex-start', ...mFont(400) },
});
