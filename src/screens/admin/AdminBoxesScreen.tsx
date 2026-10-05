import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../../stores/authStore';
import { isOpsAdmin } from '../../constants/admin';
import { WebContentPanel } from '../../components/layout/WebContentPanel';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';
import {
  DASHBOARD_REFRESH_MS,
  useBoxesDashboard,
  type BoxesDashboard,
  type DashBox,
  type DashGift,
  type DashInventoryRow,
  type DashLine,
} from '../../services/admin/boxesDashboard';

type Nav = StackNavigationProp<MainStackParamList>;
type Styles = ReturnType<typeof createStyles>;
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | undefined;

const LIVE = ['pending', 'committed', 'confirmed', 'shipped', 'delivered'];
const LOW_THRESHOLD = 2;

type InventoryView = DashInventoryRow & {
  draftDemand: number;
  remainingAfterDrafts: number | null;
  favoritesShown: number;
};

function money(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', { minimumFractionDigits: d % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function when(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

function ago(isoStr: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(isoStr)) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function statusLabel(s: string): string {
  if (s === 'pending') return 'Pending (unpaid)';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function giftState(g: DashGift): string {
  if (g.status === 'converted_to_credit') return 'Converted to credit';
  if (g.checkedOut) return 'Checked out';
  if (g.claimed) return 'Claimed';
  return g.paid ? 'Sent, unclaimed' : 'Unpaid';
}

/** Open-draft demand is recomputed so hidden test drafts don't count; stock holds stay as the server has them. */
function inventoryFor(data: BoxesDashboard, hideTests: boolean): InventoryView[] {
  const demand = new Map<string, number>();
  for (const b of data.boxes) {
    if (b.status !== 'draft' || b.playthrough || (hideTests && b.test)) continue;
    for (const l of b.lines) {
      if (!l.itemId) continue;
      demand.set(l.itemId, (demand.get(l.itemId) ?? 0) + Math.max(1, l.qty));
    }
  }
  return data.inventory
    .map((i) => {
      const d = demand.get(i.id) ?? 0;
      return {
        ...i,
        draftDemand: d,
        remainingAfterDrafts: i.remaining == null ? null : i.remaining - d,
        favoritesShown: hideTests ? i.favoritesReal : i.favorites,
      };
    })
    .sort(
      (a, b) =>
        (a.remainingAfterDrafts ?? 1e9) - (b.remainingAfterDrafts ?? 1e9) || a.name.localeCompare(b.name),
    );
}

function toneColor(colors: SemanticColors, tone: Tone): string {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.error;
    case 'info':
      return colors.info;
    case 'neutral':
      return colors.textTertiary;
    default:
      return 'transparent';
  }
}

function Chip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ChipGroup<T extends string>({
  value,
  options,
  onChange,
  styles,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  styles: Styles;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map(([v, label]) => (
        <Chip key={v} label={label} active={value === v} onPress={() => onChange(v)} styles={styles} />
      ))}
    </View>
  );
}

function Stat({ value, label, tone, styles, colors }: { value: string; label: string; tone?: Tone; styles: Styles; colors: SemanticColors }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone && tone !== 'neutral' ? { color: toneColor(colors, tone) } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type Column<T> = {
  label: string;
  width: number;
  align?: 'left' | 'right';
  cell: (row: T) => React.ReactNode;
  sort?: (row: T) => string | number | null;
};
type SortState = { col: number; dir: 'asc' | 'desc' } | null;

/** Horizontally scrolling table; sortable headers toggle direction and empty values always sort last. */
function SortTable<T>({
  columns,
  rows,
  rowKey,
  rowTone,
  renderDetail,
  openKey,
  onToggle,
  emptyMessage,
  styles,
  colors,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowTone?: (row: T) => Tone;
  renderDetail?: (row: T) => React.ReactNode;
  openKey?: string | null;
  onToggle?: (key: string) => void;
  emptyMessage: string;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const sorted = useMemo(() => {
    const col = sort ? columns[sort.col] : undefined;
    if (!sort || !col?.sort) return rows;
    const get = col.sort;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i, v: get(row) }))
      .sort((a, b) => {
        if (a.v == null || a.v === '') return b.v == null || b.v === '' ? a.i - b.i : 1;
        if (b.v == null || b.v === '') return -1;
        const c =
          typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
        return c * sign || a.i - b.i;
      })
      .map((x) => x.row);
  }, [rows, sort, columns]);

  const onHeader = (i: number) => {
    const firstDir = columns[i].align === 'right' ? 'desc' : 'asc';
    setSort((prev) =>
      prev?.col === i ? { col: i, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: i, dir: firstDir },
    );
  };
  const expandable = Boolean(renderDetail && onToggle);
  const totalWidth = columns.reduce((s, c) => s + c.width, 0) + 20 + (expandable ? 28 : 0);

  if (rows.length === 0) return <Text style={styles.hint}>{emptyMessage}</Text>;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
      <View style={{ width: totalWidth, minWidth: '100%' }}>
        <View style={[styles.tr, styles.trHead]}>
          <View style={styles.dotCell} />
          {expandable ? <View style={styles.toggleCell} /> : null}
          {columns.map((c, i) => {
            const label = `${c.label}${sort?.col === i ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}`;
            const textStyle = [styles.th, c.align === 'right' && styles.right, sort?.col === i && styles.thActive];
            return c.sort ? (
              <TouchableOpacity key={c.label} style={{ width: c.width }} onPress={() => onHeader(i)}>
                <Text style={textStyle} numberOfLines={1}>
                  {label}
                </Text>
              </TouchableOpacity>
            ) : (
              <View key={c.label} style={{ width: c.width }}>
                <Text style={textStyle}>{label}</Text>
              </View>
            );
          })}
        </View>
        {sorted.map((row) => {
          const key = rowKey(row);
          const open = expandable && openKey === key;
          return (
            <View key={key}>
              <TouchableOpacity
                activeOpacity={expandable ? 0.6 : 1}
                disabled={!expandable}
                onPress={() => onToggle?.(key)}
                style={styles.tr}
              >
                <View style={styles.dotCell}>
                  <View style={[styles.dot, { backgroundColor: toneColor(colors, rowTone?.(row)) }]} />
                </View>
                {expandable ? (
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggle}>{open ? '⌄' : '›'}</Text>
                  </View>
                ) : null}
                {columns.map((c) => {
                  const v = c.cell(row);
                  return (
                    <View key={c.label} style={{ width: c.width, paddingRight: spacing.xs }}>
                      {typeof v === 'string' ? (
                        <Text style={[styles.td, c.align === 'right' && styles.right]} numberOfLines={2}>
                          {v}
                        </Text>
                      ) : (
                        v
                      )}
                    </View>
                  );
                })}
              </TouchableOpacity>
              {open && renderDetail ? <View style={styles.detail}>{renderDetail(row)}</View> : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Who({ name, email, styles }: { name: string | null; email: string | null; styles: Styles }) {
  return (
    <View>
      <Text style={[styles.td, styles.tdStrong]} numberOfLines={1}>
        {name ?? '—'}
      </Text>
      {email && email !== name ? (
        <Text style={styles.tdMuted} numberOfLines={1}>
          {email}
        </Text>
      ) : null}
    </View>
  );
}

function LineItems({
  lines,
  inventoryById,
  styles,
  colors,
}: {
  lines: DashLine[];
  inventoryById: Map<string, InventoryView>;
  styles: Styles;
  colors: SemanticColors;
}) {
  const columns: Column<DashLine>[] = [
    { label: 'Item', width: 240, cell: (l) => l.name },
    { label: 'For', width: 110, cell: (l) => l.child ?? 'household' },
    { label: 'Qty', width: 50, align: 'right', cell: (l) => String(l.qty) },
    { label: 'Type', width: 80, cell: (l) => (l.addOn ? 'Add-on' : 'Included') },
    { label: 'Unit price', width: 80, align: 'right', cell: (l) => (l.addOn ? money(l.unitCents) : '—') },
    {
      label: 'Remaining',
      width: 90,
      align: 'right',
      cell: (l) => {
        const inv = l.itemId ? inventoryById.get(l.itemId) : undefined;
        return inv?.remaining == null ? 'untracked' : String(inv.remaining);
      },
    },
    {
      label: 'After drafts',
      width: 90,
      align: 'right',
      cell: (l) => {
        const inv = l.itemId ? inventoryById.get(l.itemId) : undefined;
        return inv?.remainingAfterDrafts == null ? 'untracked' : String(inv.remainingAfterDrafts);
      },
    },
  ];
  return (
    <SortTable<DashLine>
      columns={columns}
      rows={lines}
      rowKey={(l) => `${l.itemId ?? l.name}-${l.child ?? 'hh'}-${l.addOn}`}
      rowTone={(l) => {
        const inv = l.itemId ? inventoryById.get(l.itemId) : undefined;
        if (inv?.remainingAfterDrafts != null && inv.remainingAfterDrafts < 0) return 'danger';
        if (inv?.remaining != null && inv.remaining <= LOW_THRESHOLD) return 'warning';
        return undefined;
      }}
      emptyMessage="No line items."
      styles={styles}
      colors={colors}
    />
  );
}

function Facts({ facts, styles }: { facts: Array<[string, string]>; styles: Styles }) {
  return (
    <View style={styles.facts}>
      {facts.map(([k, v]) => (
        <View key={k} style={styles.factRow}>
          <Text style={styles.factKey}>{k}</Text>
          <Text style={styles.factValue} selectable>
            {v}
          </Text>
        </View>
      ))}
    </View>
  );
}

type BoxStatusFilter = 'active' | 'draft' | 'open' | 'fulfilled' | 'cancelled' | 'all';
type YesNoAny = 'any' | 'yes' | 'no';

function BoxesSection({
  data,
  hideTests,
  inventoryById,
  styles,
  colors,
}: {
  data: BoxesDashboard;
  hideTests: boolean;
  inventoryById: Map<string, InventoryView>;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [status, setStatus] = useState<BoxStatusFilter>('active');
  const [card, setCard] = useState<YesNoAny>('any');
  const [addOns, setAddOns] = useState<YesNoAny>('any');
  const [showPlaythrough, setShowPlaythrough] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.boxes.filter((b) => {
      if (!showPlaythrough && b.playthrough) return false;
      if (hideTests && b.test) return false;
      if (status === 'active' && b.status === 'cancelled') return false;
      if (status === 'draft' && b.status !== 'draft') return false;
      if (status === 'open' && !['pending', 'committed'].includes(b.status)) return false;
      if (status === 'fulfilled' && !['confirmed', 'shipped', 'delivered'].includes(b.status)) return false;
      if (status === 'cancelled' && b.status !== 'cancelled') return false;
      if (card === 'yes' && !b.cardOnFile) return false;
      if (card === 'no' && b.cardOnFile) return false;
      if (addOns === 'yes' && b.addOnCents <= 0) return false;
      if (addOns === 'no' && b.addOnCents > 0) return false;
      if (q && !`${b.customer ?? ''} ${b.email ?? ''} ${b.householdId}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, status, card, addOns, showPlaythrough, hideTests, query]);

  const columns: Column<DashBox>[] = [
    { label: 'Customer', width: 200, cell: (b) => <Who name={b.customer} email={b.email} styles={styles} />, sort: (b) => (b.customer ?? b.email ?? '').toLowerCase() },
    { label: 'Kids', width: 50, align: 'right', cell: (b) => String(b.kids), sort: (b) => b.kids },
    { label: 'Status', width: 120, cell: (b) => statusLabel(b.status), sort: (b) => b.status },
    { label: 'Card', width: 50, cell: (b) => (b.cardOnFile ? 'Yes' : 'No'), sort: (b) => (b.cardOnFile ? 1 : 0) },
    { label: 'Box price', width: 80, align: 'right', cell: (b) => money(b.boxPriceCents), sort: (b) => b.boxPriceCents },
    { label: 'Add-ons', width: 70, align: 'right', cell: (b) => (b.addOnCents ? money(b.addOnCents) : '—'), sort: (b) => b.addOnCents },
    {
      label: 'Total',
      width: 90,
      align: 'right',
      cell: (b) => (b.source === 'draft' ? `${money(b.subtotalCents)} est.` : money(b.totalCents)),
      sort: (b) => (b.source === 'draft' ? b.subtotalCents : b.totalCents),
    },
    { label: 'Last updated', width: 120, cell: (b) => when(b.updatedAt), sort: (b) => (b.updatedAt ? Date.parse(b.updatedAt) : null) },
    { label: 'Attribution', width: 140, cell: (b) => b.attribution ?? '—', sort: (b) => b.attribution },
  ];

  return (
    <View style={styles.sectionBody}>
      <ChipGroup<BoxStatusFilter>
        value={status}
        onChange={setStatus}
        styles={styles}
        options={[
          ['active', 'All except cancelled'],
          ['draft', 'Drafts'],
          ['open', 'Committed, not charged'],
          ['fulfilled', 'Charged / shipped'],
          ['cancelled', 'Cancelled'],
          ['all', 'Everything'],
        ]}
      />
      <View style={styles.chipRow}>
        <ChipGroup<YesNoAny> value={card} onChange={setCard} styles={styles} options={[['any', 'Card: any'], ['yes', 'Card on file'], ['no', 'No card']]} />
        <ChipGroup<YesNoAny> value={addOns} onChange={setAddOns} styles={styles} options={[['any', 'Add-ons: any'], ['yes', 'Has add-ons'], ['no', 'No add-ons']]} />
        <Chip label="Show playthrough" active={showPlaythrough} onPress={() => setShowPlaythrough((v) => !v)} styles={styles} />
      </View>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or email"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SortTable<DashBox>
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        rowTone={(b) => {
          if (b.status === 'cancelled') return 'neutral';
          if (['shipped', 'delivered', 'confirmed'].includes(b.status)) return 'success';
          if (!b.cardOnFile) return 'warning';
          return undefined;
        }}
        openKey={openId}
        onToggle={(k) => setOpenId((prev) => (prev === k ? null : k))}
        renderDetail={(b) => (
          <View style={styles.detailInner}>
            <LineItems lines={b.lines} inventoryById={inventoryById} styles={styles} colors={colors} />
            <Facts
              styles={styles}
              facts={[
                ['Box price', `${money(b.boxPriceCents)} (${b.kids} kid${b.kids === 1 ? '' : 's'})`],
                ['Add-ons', money(b.addOnCents)],
                ['Subtotal', b.source === 'draft' ? `${money(b.subtotalCents)} est.` : money(b.subtotalCents)],
                ['Shipping', money(b.shippingCents)],
                ['Tax', money(b.taxCents)],
                ['Credit applied', b.creditCents ? `−${money(b.creditCents)}` : '—'],
                ['Total', money(b.totalCents)],
                ['Committed', when(b.committedAt)],
                ['Household', b.householdId],
                ['Order', b.orderId ?? 'draft (no order)'],
              ]}
            />
          </View>
        )}
        emptyMessage={hideTests ? 'No real customer boxes match. Turn off Hide tests to see test boxes.' : 'No boxes match these filters.'}
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`${rows.length} of ${data.boxes.length} boxes. Tap a row for its items. Drafts appear only when the household has no live order; draft totals are box price plus add-ons before shipping and tax. Dot: green charged/shipped, amber no card on file, grey cancelled.`}
      </Text>
    </View>
  );
}

function GiftsSection({
  data,
  hideTests,
  inventoryById,
  styles,
  colors,
}: {
  data: BoxesDashboard;
  hideTests: boolean;
  inventoryById: Map<string, InventoryView>;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [kind, setKind] = useState<'any' | 'box' | 'credit'>('any');
  const [paid, setPaid] = useState<YesNoAny>('any');
  const [showPlaythrough, setShowPlaythrough] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      data.gifts.filter((g) => {
        if (!showPlaythrough && g.playthrough) return false;
        if (hideTests && g.test) return false;
        if (kind !== 'any' && g.kind !== kind) return false;
        if (paid === 'yes' && !g.paid) return false;
        if (paid === 'no' && g.paid) return false;
        return true;
      }),
    [data, kind, paid, showPlaythrough, hideTests],
  );

  const columns: Column<DashGift>[] = [
    { label: 'Giver', width: 190, cell: (g) => <Who name={g.giver} email={g.giverEmail} styles={styles} />, sort: (g) => (g.giver ?? g.giverEmail ?? '').toLowerCase() },
    { label: 'Recipient', width: 190, cell: (g) => <Who name={g.recipientName} email={g.recipientEmail} styles={styles} />, sort: (g) => (g.recipientName ?? g.recipientEmail ?? '').toLowerCase() },
    { label: 'Kind', width: 110, cell: (g) => (g.kind === 'box' ? `Box (${g.lines.length} items)` : 'Credit'), sort: (g) => g.kind },
    { label: 'Amount', width: 80, align: 'right', cell: (g) => money(g.amountCents), sort: (g) => g.amountCents },
    { label: 'Paid', width: 50, cell: (g) => (g.paid ? 'Yes' : 'No'), sort: (g) => (g.paid ? 1 : 0) },
    { label: 'State', width: 140, cell: (g) => giftState(g), sort: (g) => giftState(g) },
    { label: 'Holds stock', width: 90, cell: (g) => (g.holdingStock ? 'Yes' : '—'), sort: (g) => (g.holdingStock ? 1 : 0) },
    { label: 'Created', width: 120, cell: (g) => when(g.createdAt), sort: (g) => (g.createdAt ? Date.parse(g.createdAt) : null) },
  ];

  return (
    <View style={styles.sectionBody}>
      <View style={styles.chipRow}>
        <ChipGroup value={kind} onChange={setKind} styles={styles} options={[['any', 'Kind: any'], ['box', 'Box gifts'], ['credit', 'Credit gifts']]} />
        <ChipGroup<YesNoAny> value={paid} onChange={setPaid} styles={styles} options={[['any', 'Paid: any'], ['yes', 'Paid'], ['no', 'Unpaid']]} />
        <Chip label="Show playthrough" active={showPlaythrough} onPress={() => setShowPlaythrough((v) => !v)} styles={styles} />
      </View>
      <SortTable<DashGift>
        columns={columns}
        rows={rows}
        rowKey={(g) => g.id}
        rowTone={(g) => (g.checkedOut ? 'success' : g.paid && !g.claimed ? 'info' : !g.paid ? 'neutral' : undefined)}
        openKey={openId}
        onToggle={(k) => setOpenId((prev) => (prev === k ? null : k))}
        renderDetail={(g) => (
          <View style={styles.detailInner}>
            {g.message ? <Text style={styles.quote}>{`“${g.message}”`}</Text> : null}
            {g.lines.length ? <LineItems lines={g.lines} inventoryById={inventoryById} styles={styles} colors={colors} /> : null}
            {g.checkoutOrders.length ? (
              <Facts
                styles={styles}
                facts={g.checkoutOrders.map((o) => [
                  `Checkout ${o.id}`,
                  `${statusLabel(o.status)} · ${money(o.totalCents)} · ${when(o.createdAt)}`,
                ])}
              />
            ) : null}
            <Text style={styles.caption}>{`Invite ${g.id} · payment status ${g.paymentStatus ?? 'none'}`}</Text>
          </View>
        )}
        emptyMessage={hideTests ? 'No real customer gifts match. Turn off Hide tests to see test gifts.' : 'No gifts match these filters.'}
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`${rows.length} of ${data.gifts.length} gift invites. Unpaid rows are gift checkouts that were started but never paid. Dot: green checked out, blue paid and waiting on the recipient, grey unpaid.`}
      </Text>
    </View>
  );
}

function InventorySection({
  inventory,
  styles,
  colors,
}: {
  inventory: InventoryView[];
  styles: Styles;
  colors: SemanticColors;
}) {
  const [view, setView] = useState<'all' | 'tracked' | 'held' | 'low'>('all');
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inventory.filter((i) => {
      if (view === 'tracked' && i.stock == null) return false;
      if (view === 'low' && (i.remainingAfterDrafts == null || i.remainingAfterDrafts > LOW_THRESHOLD)) return false;
      if (view === 'held' && i.counterAllocated + i.draftDemand + i.directSold + i.directReserved === 0) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inventory, view, query]);
  const dash = (n: number) => (n ? String(n) : '—');

  const columns: Column<InventoryView>[] = [
    { label: 'Item', width: 240, cell: (i) => i.name, sort: (i) => i.name.toLowerCase() },
    { label: 'Favorited', width: 80, align: 'right', cell: (i) => dash(i.favoritesShown), sort: (i) => i.favoritesShown },
    { label: 'Stock', width: 70, align: 'right', cell: (i) => (i.stock == null ? 'untracked' : String(i.stock)), sort: (i) => i.stock },
    { label: 'Boxes', width: 60, align: 'right', cell: (i) => dash(i.heldByBoxes), sort: (i) => i.heldByBoxes },
    { label: 'Gifts', width: 60, align: 'right', cell: (i) => dash(i.heldByGifts), sort: (i) => i.heldByGifts },
    { label: 'Sold', width: 60, align: 'right', cell: (i) => dash(i.directSold), sort: (i) => i.directSold },
    { label: 'Reserved', width: 75, align: 'right', cell: (i) => dash(i.directReserved), sort: (i) => i.directReserved },
    { label: 'Remaining', width: 85, align: 'right', cell: (i) => (i.remaining == null ? '—' : String(i.remaining)), sort: (i) => i.remaining },
    { label: 'Draft demand', width: 95, align: 'right', cell: (i) => dash(i.draftDemand), sort: (i) => i.draftDemand },
    {
      label: 'After drafts',
      width: 90,
      align: 'right',
      cell: (i) => (i.remainingAfterDrafts == null ? '—' : String(i.remainingAfterDrafts)),
      sort: (i) => i.remainingAfterDrafts,
    },
  ];

  return (
    <View style={styles.sectionBody}>
      <ChipGroup
        value={view}
        onChange={setView}
        styles={styles}
        options={[
          ['all', 'All items'],
          ['tracked', 'Stock-tracked'],
          ['held', 'Held or wanted'],
          ['low', `${LOW_THRESHOLD} or fewer after drafts`],
        ]}
      />
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search item"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SortTable<InventoryView>
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        rowTone={(i) =>
          (i.remainingAfterDrafts != null && i.remainingAfterDrafts < 0) || (i.remaining != null && i.remaining <= 0)
            ? 'danger'
            : i.remainingAfterDrafts != null && i.remainingAfterDrafts <= LOW_THRESHOLD
              ? 'warning'
              : undefined
        }
        emptyMessage="No items match."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`${rows.length} of ${inventory.length} items. Favorited = households with the item in their favorites (guest favorites aren't stored; test households are left out while Hide tests is on). Remaining = stock − held by boxes and gifts − direct sold − direct reserved. Draft demand counts open drafts with no live order (not yet holding stock). Held quantities include test orders, since the server really reserves that stock. Untracked items have no stock ceiling. Dot: red at or below zero, amber ${LOW_THRESHOLD} or fewer.`}
      </Text>
    </View>
  );
}

type Tab = 'boxes' | 'gifts' | 'inventory';

/** Ops dashboard of Hanukkah boxes, gifts and inventory holds — admin-gated, refreshes every minute. */
export function AdminBoxesScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isOpsAdmin(user);
  const { data, error, refreshing, refresh } = useBoxesDashboard(allowed);
  const [tab, setTab] = useState<Tab>('boxes');
  const [hideTests, setHideTests] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const inventory = useMemo(() => (data ? inventoryFor(data, hideTests) : []), [data, hideTests]);
  const inventoryById = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!allowed) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          <Text style={styles.title}>Admin only</Text>
          <Text style={styles.hint}>This page is limited to allowlisted ops accounts.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>← Back</Text>
          </TouchableOpacity>
        </View>
      </WebContentPanel>
    );
  }

  if (!data) {
    return (
      <WebContentPanel {...panelProps}>
        <View style={styles.centered}>
          {error ? (
            <>
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity onPress={() => void refresh()}>
                <Text style={styles.backLink}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <BrandLoadingMark color={colors.brand} />
          )}
        </View>
      </WebContentPanel>
    );
  }

  const real = data.boxes.filter((b) => !b.playthrough && !(hideTests && b.test));
  const liveOrders = real.filter((b) => b.source === 'order' && LIVE.includes(b.status));
  const openDrafts = real.filter((b) => b.status === 'draft');
  const noCard = [...liveOrders, ...openDrafts].filter((b) => !b.cardOnFile);
  const realGifts = data.gifts.filter((g) => !g.playthrough && !(hideTests && g.test));
  const atZero = inventory.filter((i) => i.remaining != null && i.remaining <= 0);
  const negAfterDrafts = inventory.filter((i) => i.remainingAfterDrafts != null && i.remainingAfterDrafts < 0);
  const testBoxes = data.boxes.filter((b) => b.test && !b.playthrough).length;
  const testGifts = data.gifts.filter((g) => g.test && !g.playthrough).length;
  const liveRevenue = liveOrders.reduce((s, b) => s + (b.totalCents ?? 0), 0);
  const draftValue = openDrafts.reduce((s, b) => s + (b.subtotalCents ?? 0), 0);

  return (
    <WebContentPanel {...panelProps}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backWrap}>
          <Text style={styles.backLink}>← Account</Text>
        </TouchableOpacity>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Boxes and gifts</Text>
          <Text style={styles.subtitle}>
            {`${data.counts.households} households · box lock ${data.lockAt ? when(data.lockAt) : 'not set'}`}
          </Text>
          <Text style={styles.meta}>
            {refreshing
              ? 'Updating…'
              : `Updated ${ago(data.generatedAt, now)} · refreshes every ${DASHBOARD_REFRESH_MS / 60_000} min`}
            {error ? ` · last refresh failed: ${error}` : ''}
          </Text>
          <View style={[styles.chipRow, styles.headerChips]}>
            <Chip label="Refresh now" onPress={() => void refresh()} styles={styles} />
            <Chip
              label={`Hide tests · ${testBoxes} boxes, ${testGifts} gifts`}
              active={hideTests}
              onPress={() => setHideTests((v) => !v)}
              styles={styles}
            />
          </View>
        </View>

        {data.mismatches.length ? (
          <View style={styles.alert}>
            <Text style={styles.alertTitle}>Inventory counters disagree with this snapshot</Text>
            <Text style={styles.hint}>
              {data.mismatches.map((m) => `${m.name}: computed ${m.computed}, server counter ${m.counter}`).join(' · ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionDivider} />
        <View style={styles.stats}>
          <Stat value={String(liveOrders.length)} label={`Live box orders · ${money(liveRevenue)}`} tone="info" styles={styles} colors={colors} />
          <Stat value={String(noCard.length)} label="Live orders and drafts with no card" tone={noCard.length ? 'warning' : undefined} styles={styles} colors={colors} />
          <Stat value={String(openDrafts.length)} label={`Open drafts · ~${money(draftValue)} before ship/tax`} styles={styles} colors={colors} />
          <Stat
            value={`${realGifts.filter((g) => g.paid).length} / ${realGifts.filter((g) => g.claimed).length}`}
            label="Gifts paid / claimed"
            styles={styles}
            colors={colors}
          />
          <Stat
            value={String(atZero.length)}
            label={`Items at or below zero · ${negAfterDrafts.length} negative if drafts commit`}
            tone={atZero.length || negAfterDrafts.length ? 'danger' : 'success'}
            styles={styles}
            colors={colors}
          />
        </View>

        <View style={styles.sectionDivider} />
        <View style={styles.chipRow}>
          <Chip label={`Boxes (${real.length})`} active={tab === 'boxes'} onPress={() => setTab('boxes')} styles={styles} />
          <Chip label={`Gifts (${realGifts.length})`} active={tab === 'gifts'} onPress={() => setTab('gifts')} styles={styles} />
          <Chip label={`Inventory (${inventory.length})`} active={tab === 'inventory'} onPress={() => setTab('inventory')} styles={styles} />
        </View>

        {tab === 'boxes' ? (
          <>
            <Text style={styles.section}>Boxes</Text>
            <BoxesSection data={data} hideTests={hideTests} inventoryById={inventoryById} styles={styles} colors={colors} />
          </>
        ) : null}
        {tab === 'gifts' ? (
          <>
            <Text style={styles.section}>Gifts</Text>
            <GiftsSection data={data} hideTests={hideTests} inventoryById={inventoryById} styles={styles} colors={colors} />
          </>
        ) : null}
        {tab === 'inventory' ? (
          <>
            <Text style={styles.section}>Inventory against holds and drafts</Text>
            <InventorySection inventory={inventory} styles={styles} colors={colors} />
          </>
        ) : null}
      </ScrollView>
    </WebContentPanel>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    panel: { flex: 1, width: '100%', backgroundColor: colors.bgPrimary },
    root: { flex: 1, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 120,
      maxWidth: isDesktop ? 1120 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
    backWrap: { alignSelf: 'flex-start' },
    backLink: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      letterSpacing: -0.22,
    },
    headerBlock: { alignItems: 'center', marginTop: spacing.sm },
    title: {
      ...typeface('medium'),
      fontSize: 36,
      letterSpacing: -0.8,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      ...typeface('light'),
      fontSize: typography.lg,
      marginTop: spacing.sm,
      color: colors.textPrimary,
      letterSpacing: -0.26,
      textAlign: 'center',
    },
    meta: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.goldMuted,
      marginTop: 4,
      letterSpacing: -0.22,
      textAlign: 'center',
    },
    headerChips: { justifyContent: 'center', marginTop: spacing.md },
    section: {
      ...typeface('medium'),
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
      color: colors.logoDark,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionDivider: {
      alignSelf: 'stretch',
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    sectionBody: { gap: spacing.sm },
    hint: {
      ...typeface('regular'),
      fontSize: typography.md,
      letterSpacing: -0.22,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    caption: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      letterSpacing: -0.22,
      lineHeight: 17,
    },
    error: { ...typeface('regular'), fontSize: typography.md, color: colors.error, textAlign: 'center' },
    alert: {
      marginTop: spacing.md,
      padding: spacing.sm,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.error,
      gap: 4,
    },
    alertTitle: { ...typeface('medium'), fontSize: typography.md, color: colors.error },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    stat: { flexGrow: 1, flexBasis: isDesktop ? 160 : 140, minWidth: 0 },
    statValue: {
      ...typeface('medium'),
      fontSize: 28,
      letterSpacing: -0.6,
      color: colors.textPrimary,
    },
    statLabel: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      letterSpacing: -0.22,
      marginTop: 2,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
    chip: {
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      backgroundColor: colors.bgPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: colors.brand },
    chipLabel: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    input: {
      ...typeface('regular'),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brand,
      borderRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      fontSize: Platform.OS === 'web' ? 14 : 16,
      color: colors.textPrimary,
      minHeight: 40,
      maxWidth: 360,
    },
    tr: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    trHead: { borderBottomColor: colors.borderDark },
    th: {
      ...typeface('medium'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      letterSpacing: -0.22,
      paddingRight: spacing.xs,
    },
    thActive: { color: colors.textPrimary },
    td: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textPrimary,
      letterSpacing: -0.22,
    },
    tdStrong: { ...typeface('medium') },
    tdMuted: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.textSecondary,
    },
    right: { textAlign: 'right' },
    dotCell: { width: 20, alignItems: 'center' },
    dot: { width: 7, height: 7, borderRadius: 4 },
    toggleCell: { width: 28 },
    toggle: { ...typeface('regular'), fontSize: 16, color: colors.textTertiary },
    detail: {
      paddingVertical: spacing.sm,
      paddingLeft: 48,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    detailInner: { gap: spacing.sm, paddingRight: spacing.sm },
    facts: { gap: 2, maxWidth: 420 },
    factRow: { flexDirection: 'row', gap: spacing.sm },
    factKey: {
      ...typeface('light'),
      fontSize: typography.sm,
      color: colors.textSecondary,
      width: 120,
    },
    factValue: {
      ...typeface('regular'),
      fontSize: typography.sm,
      color: colors.textPrimary,
      flex: 1,
    },
    quote: {
      ...typeface('light'),
      fontSize: typography.md,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
  });
}
