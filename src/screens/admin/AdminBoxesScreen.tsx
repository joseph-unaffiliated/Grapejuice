import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useViewportPinnedHeight } from '../../components/storefront/storefrontViewport';
import { useThemeMode } from '../../context/ThemeContext';
import { useWebLayout } from '../../hooks/useWebLayout';
import { spacing, typography, borderRadius, typeface } from '../../constants/theme';
import type { SemanticColors } from '../../constants/themeMode';
import type { MainStackParamList } from '../../navigation/types';
import {
  DASHBOARD_REFRESH_MS,
  useBoxesDashboard,
  type BoxesDashboard,
  type DashAdPerson,
  type DashAnswers,
  type DashBox,
  type DashFunnelPerson,
  type DashGift,
  type DashGiftFunnelPerson,
  type DashGuest,
  type DashInventoryRow,
  type DashLine,
  type GiftFunnelKey,
  type MetaAdStats,
} from '../../services/admin/boxesDashboard';
import { PromotionsSection, type PromotionsTab } from './AdminPromotionsSections';

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

const LEVEL_SCORE: Record<string, number> = { minimal: 15, moderate: 50, 'all-in': 85 };
const LEVEL_LABEL: Record<string, string> = { minimal: 'Minimal', moderate: 'Moderate', 'all-in': 'All-in' };
const ANSWERS_CAPTION =
  'Hanukkah = "How has Hanukkah looked in recent years?" (0 we don’t really do it, 100 all eight nights). Jewish = "How often do you do Jewish stuff?" (0 almost never, 100 every day). Older accounts only saved a Hanukkah level; — means not answered.';

/** Onboarding slider columns, shared by every table. */
function answerColumns<T>(get: (row: T) => DashAnswers): Column<T>[] {
  return [
    {
      label: 'Hanukkah',
      width: 80,
      align: 'right',
      cell: (r) => {
        const a = get(r);
        if (a.hanukkah != null) return String(a.hanukkah);
        return a.hanukkahLevel ? LEVEL_LABEL[a.hanukkahLevel] ?? a.hanukkahLevel : '—';
      },
      sort: (r) => {
        const a = get(r);
        return a.hanukkah ?? (a.hanukkahLevel ? LEVEL_SCORE[a.hanukkahLevel] ?? null : null);
      },
    },
    {
      label: 'Jewish',
      width: 65,
      align: 'right',
      cell: (r) => {
        const v = get(r).jewish;
        return v == null ? '—' : String(v);
      },
      sort: (r) => get(r).jewish,
    },
  ];
}

const GUEST_STAGE_LABEL: Record<DashGuest['stage'], string> = {
  started: 'Started onboarding',
  answered: 'Answered questions',
  built: 'Built a box',
  revealed: 'Saw their box',
  gift: 'Gift draft only',
};

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

type Placed = { location?: string | null; fromIp?: boolean };

/** "NY" from an address, "~NY" when estimated from the IP address. */
function placeLabel(p: Placed): string {
  return p.location ? `${p.fromIp ? '~' : ''}${p.location}` : '—';
}

/** "By state: NY 4 · ON, Canada 2 · unknown 3 (~ 5 estimated from IP)" for the rows currently shown. */
function stateSummary(rows: Placed[], label = 'By state'): string {
  const counts = new Map<string, number>();
  let missing = 0;
  let fromIp = 0;
  for (const r of rows) {
    if (!r.location) {
      missing += 1;
      continue;
    }
    counts.set(r.location, (counts.get(r.location) ?? 0) + 1);
    if (r.fromIp) fromIp += 1;
  }
  const parts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s, n]) => `${s} ${n}`);
  if (missing) parts.push(`unknown ${missing}`);
  if (!parts.length) return '';
  const note = fromIp ? ` (~ ${fromIp} estimated from IP address; mobile networks can be off by a state)` : '';
  return `${label}: ${parts.join(' · ')}${note}`;
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
    { label: 'State', width: 100, cell: (b) => placeLabel({ location: b.location, fromIp: b.locationFromIp }), sort: (b) => b.location ?? null },
    { label: 'Kids', width: 50, align: 'right', cell: (b) => String(b.kids), sort: (b) => b.kids },
    ...answerColumns<DashBox>((b) => b.answers),
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
      {rows.length ? <Text style={styles.caption}>{stateSummary(rows.map((b) => ({ location: b.location, fromIp: b.locationFromIp })))}</Text> : null}
      <Text style={styles.caption}>
        {`${rows.length} of ${data.boxes.length} boxes. Tap a row for its items. Drafts appear only when the household has no live order; draft totals are box price plus add-ons before shipping and tax. Dot: green charged/shipped, amber no card on file, grey cancelled. ${ANSWERS_CAPTION}`}
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
    { label: 'Giver from', width: 100, cell: (g) => placeLabel({ location: g.giverLocation, fromIp: true }), sort: (g) => g.giverLocation ?? null },
    { label: 'Recipient', width: 190, cell: (g) => <Who name={g.recipientName} email={g.recipientEmail} styles={styles} />, sort: (g) => (g.recipientName ?? g.recipientEmail ?? '').toLowerCase() },
    { label: 'Ships to', width: 90, cell: (g) => g.location ?? '—', sort: (g) => g.location ?? null },
    ...answerColumns<DashGift>((g) => g.recipientAnswers),
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
      {rows.length ? (
        <Text style={styles.caption}>
          {[
            stateSummary(rows.map((g) => ({ location: g.location })), 'Ships to'),
            stateSummary(rows.map((g) => ({ location: g.giverLocation, fromIp: true })), 'Givers from'),
          ]
            .filter(Boolean)
            .join('\n')}
        </Text>
      ) : null}
      <Text style={styles.caption}>
        {`${rows.length} of ${data.gifts.length} gift invites. A gift appears here once the giver presses Continue on "Where should we send it?" and payment opens; unpaid rows never finished paying. Dot: green checked out, blue paid and waiting on the recipient, grey unpaid. Everyone who started a gift but stopped before payment is on the Gift funnel tab. Hanukkah and Jewish are the recipient's answers once they've signed up. ${ANSWERS_CAPTION}`}
      </Text>
    </View>
  );
}

type GuestSignupFilter = 'open' | 'converted' | 'all';
type GuestStageFilter = 'any' | 'box' | 'answered' | 'started' | 'gift';

function AnonymousSection({
  guests,
  totalSessions,
  inventoryById,
  styles,
  colors,
}: {
  guests: DashGuest[];
  totalSessions: number;
  inventoryById: Map<string, InventoryView>;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [signup, setSignup] = useState<GuestSignupFilter>('open');
  const [stage, setStage] = useState<GuestStageFilter>('any');
  const [lead, setLead] = useState<YesNoAny>('any');
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      guests.filter((g) => {
        if (signup === 'open' && g.converted) return false;
        if (signup === 'converted' && !g.converted) return false;
        if (stage === 'box' && g.stage !== 'built' && g.stage !== 'revealed') return false;
        if (stage === 'answered' && g.stage !== 'answered') return false;
        if (stage === 'started' && g.stage !== 'started') return false;
        if (stage === 'gift' && !g.gift) return false;
        if (lead === 'yes' && !g.leadAt) return false;
        if (lead === 'no' && g.leadAt) return false;
        return true;
      }),
    [guests, signup, stage, lead],
  );

  const columns: Column<DashGuest>[] = [
    {
      label: 'Visitor',
      width: 150,
      cell: (g) => <Who name={g.id.slice(0, 8)} email={g.source} styles={styles} />,
      sort: (g) => g.source ?? '',
    },
    { label: 'Stage', width: 140, cell: (g) => GUEST_STAGE_LABEL[g.stage], sort: (g) => g.stage },
    { label: 'State', width: 100, cell: (g) => placeLabel({ location: g.location, fromIp: true }), sort: (g) => g.location ?? null },
    { label: 'Kids', width: 50, align: 'right', cell: (g) => String(g.kids), sort: (g) => g.kids },
    ...answerColumns<DashGuest>((g) => g.answers),
    { label: 'Items', width: 55, align: 'right', cell: (g) => (g.lines.length ? String(g.lines.length) : '—'), sort: (g) => g.lines.length },
    {
      label: 'Est. total',
      width: 85,
      align: 'right',
      cell: (g) => (g.lines.length ? money(g.boxPriceCents + g.addOnCents) : '—'),
      sort: (g) => (g.lines.length ? g.boxPriceCents + g.addOnCents : null),
    },
    { label: 'Email given', width: 90, cell: (g) => (g.leadAt ? when(g.leadAt) : '—'), sort: (g) => (g.leadAt ? Date.parse(g.leadAt) : null) },
    { label: 'Signed up', width: 75, cell: (g) => (g.converted ? 'Yes' : 'No'), sort: (g) => (g.converted ? 1 : 0) },
    { label: 'Started', width: 120, cell: (g) => when(g.createdAt), sort: (g) => (g.createdAt ? Date.parse(g.createdAt) : null) },
    { label: 'Last active', width: 120, cell: (g) => when(g.updatedAt), sort: (g) => (g.updatedAt ? Date.parse(g.updatedAt) : null) },
  ];

  return (
    <View style={styles.sectionBody}>
      <ChipGroup<GuestSignupFilter>
        value={signup}
        onChange={setSignup}
        styles={styles}
        options={[
          ['open', 'Not signed up'],
          ['converted', 'Signed up later'],
          ['all', 'Everyone'],
        ]}
      />
      <View style={styles.chipRow}>
        <ChipGroup<GuestStageFilter>
          value={stage}
          onChange={setStage}
          styles={styles}
          options={[
            ['any', 'Stage: any'],
            ['box', 'Has a box'],
            ['answered', 'Answered, no box'],
            ['started', 'Started onboarding'],
            ['gift', 'Gift drafts'],
          ]}
        />
        <ChipGroup<YesNoAny> value={lead} onChange={setLead} styles={styles} options={[['any', 'Email: any'], ['yes', 'Email given'], ['no', 'No email']]} />
      </View>
      <SortTable<DashGuest>
        columns={columns}
        rows={rows}
        rowKey={(g) => g.id}
        rowTone={(g) => (g.converted ? 'success' : g.leadAt ? 'info' : g.stage === 'built' || g.stage === 'revealed' ? 'warning' : undefined)}
        openKey={openId}
        onToggle={(k) => setOpenId((prev) => (prev === k ? null : k))}
        renderDetail={(g) => (
          <View style={styles.detailInner}>
            {g.lines.length ? <LineItems lines={g.lines} inventoryById={inventoryById} styles={styles} colors={colors} /> : null}
            <Facts
              styles={styles}
              facts={[
                ['Visitor ID', g.id],
                ['Onboarding step', g.step ?? '—'],
                ['Box price', `${money(g.boxPriceCents)} (${g.kids} kid${g.kids === 1 ? '' : 's'})`],
                ['Add-ons', money(g.addOnCents)],
                ['Source', g.source ?? '—'],
                ['Landing page', g.landingPath ?? '—'],
                ['Last page', g.lastPath ?? '—'],
                ['Signed up', g.converted ? when(g.convertedAt) : 'No'],
                [
                  'Gift draft',
                  g.gift
                    ? [g.gift.kind, g.gift.giverName && `from ${g.gift.giverName}`, g.gift.recipientEmail && `to ${g.gift.recipientEmail}`, g.gift.items ? `${g.gift.items} items` : null]
                        .filter(Boolean)
                        .join(' · ')
                    : '—',
                ],
                ['Resumed from email', g.resumeCount ? `${g.resumeCount}×` : '—'],
                ['Saves', String(g.saveCount)],
              ]}
            />
          </View>
        )}
        emptyMessage="No anonymous sessions match these filters."
        styles={styles}
        colors={colors}
      />
      {rows.length ? <Text style={styles.caption}>{stateSummary(rows.map((g) => ({ location: g.location, fromIp: true })))}</Text> : null}
      <Text style={styles.caption}>
        {`${rows.length} of ${guests.length} signed-out visitors who started a box or gift (${totalSessions} saved sessions; browsing with only favorites is left out, sessions expire after 60 days). Visitor is the first characters of the browser's visitor ID, with where they came from underneath. Email given = they entered an email we matched through Retention. Signed up later = they made an account, so their box also appears on the Boxes tab. Dot: green signed up, blue email given, amber built a box but neither. Test visits can't be told apart here. ${ANSWERS_CAPTION}`}
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

type Fit = 'low' | 'high' | 'unknown';

/** Both sliders start at 50, so 50/50 is treated as untouched; Hanukkah alone is too skewed to score. */
function fitOf(p: DashAdPerson, jewishWeight: number, cutoff: number): { fit: Fit; score: number | null } {
  if (p.jewish == null || (p.jewish === 50 && p.hanukkah === 50)) return { fit: 'unknown', score: null };
  const score = p.hanukkah == null ? p.jewish : jewishWeight * p.jewish + (1 - jewishWeight) * p.hanukkah;
  return { fit: score < cutoff ? 'low' : 'high', score };
}

type AdRow = {
  ad: string;
  people: number;
  answered: number;
  boxes: number;
  accounts: number;
  purchases: number;
  avgScore: number | null;
  lowAnswered: [number, number];
  lowBoxes: [number, number];
  lowAccounts: [number, number];
  creditedBoxes: number;
  creditedAccounts: number;
  meta: MetaAdStats | null;
};

const ALL_ADS = 'All sources';

function sumMeta(stats: MetaAdStats[]): MetaAdStats {
  const total: MetaAdStats = { spend: 0, linkClicks: 0, landingPageViews: 0, addToCart: 0, registrations: 0, purchases: 0 };
  for (const s of stats) for (const k of Object.keys(total) as (keyof MetaAdStats)[]) total[k] += s[k];
  return total;
}

function adRows(
  people: DashAdPerson[],
  jewishWeight: number,
  cutoff: number,
  highCredit: number,
  unknownCredit: number,
  metaByAd: Record<string, MetaAdStats> | null,
): AdRow[] {
  const groups = new Map<string, DashAdPerson[]>([[ALL_ADS, people]]);
  for (const p of people) groups.set(p.ad, [...(groups.get(p.ad) ?? []), p]);
  // Ads Meta spent on that brought no one in still get a row.
  for (const [ad, s] of Object.entries(metaByAd ?? {})) if (s.spend > 0 && !groups.has(ad)) groups.set(ad, []);
  const metaTotal = metaByAd ? sumMeta(Object.values(metaByAd)) : null;
  const credit = (f: Fit) => (f === 'low' ? 1 : f === 'high' ? highCredit : unknownCredit);
  return [...groups].map(([ad, list]) => {
    const scored = list.map((p) => ({ p, ...fitOf(p, jewishWeight, cutoff) }));
    const lowShare = (keep: (p: DashAdPerson) => boolean): [number, number] => {
      const known = scored.filter((s) => keep(s.p) && s.fit !== 'unknown');
      return [known.filter((s) => s.fit === 'low').length, known.length];
    };
    const scores = scored.map((s) => s.score).filter((s): s is number => s != null);
    return {
      ad,
      people: list.length,
      answered: list.filter((p) => p.answered).length,
      boxes: list.filter((p) => p.box).length,
      accounts: list.filter((p) => p.account).length,
      purchases: list.filter((p) => p.purchase).length,
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      lowAnswered: lowShare((p) => p.answered),
      lowBoxes: lowShare((p) => p.box),
      lowAccounts: lowShare((p) => p.account),
      creditedBoxes: scored.filter((s) => s.p.box).reduce((sum, s) => sum + credit(s.fit), 0),
      creditedAccounts: scored.filter((s) => s.p.account).reduce((sum, s) => sum + credit(s.fit), 0),
      meta: ad === ALL_ADS ? metaTotal : metaByAd?.[ad] ?? null,
    };
  });
}

const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const share = ([low, known]: [number, number]) => (known ? `${low} of ${known}` : '—');
const tenths = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function AdsSection({
  people,
  metaByAd,
  hideTests,
  styles,
  colors,
}: {
  people: DashAdPerson[];
  metaByAd: Record<string, MetaAdStats> | null;
  hideTests: boolean;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [jewishWeight, setJewishWeight] = useState('0.75');
  const [cutoff, setCutoff] = useState('50');
  const [highCredit, setHighCredit] = useState('0.5');
  const [unknownCredit, setUnknownCredit] = useState('0.75');

  const rows = useMemo(
    () =>
      adRows(
        people.filter((p) => !(hideTests && p.test)),
        Number(jewishWeight),
        Number(cutoff),
        Number(highCredit),
        Number(unknownCredit),
        metaByAd,
      ),
    [people, metaByAd, hideTests, jewishWeight, cutoff, highCredit, unknownCredit],
  );

  const columns: Column<AdRow>[] = [
    { label: 'Ad', width: 170, cell: (r) => <Text style={[styles.td, r.ad === ALL_ADS && styles.tdStrong]} numberOfLines={2}>{r.ad}</Text>, sort: (r) => (r.ad === ALL_ADS ? '' : r.ad) },
    { label: 'People', width: 60, align: 'right', cell: (r) => String(r.people), sort: (r) => r.people },
    { label: 'Answered', width: 75, align: 'right', cell: (r) => String(r.answered), sort: (r) => r.answered },
    { label: 'Boxes', width: 60, align: 'right', cell: (r) => String(r.boxes), sort: (r) => r.boxes },
    { label: 'Accounts', width: 75, align: 'right', cell: (r) => String(r.accounts), sort: (r) => r.accounts },
    { label: 'Purchases', width: 80, align: 'right', cell: (r) => String(r.purchases), sort: (r) => r.purchases },
    { label: 'Avg score', width: 75, align: 'right', cell: (r) => (r.avgScore == null ? '—' : String(Math.round(r.avgScore))), sort: (r) => r.avgScore },
    { label: '70% · answered', width: 110, align: 'right', cell: (r) => share(r.lowAnswered), sort: (r) => (r.lowAnswered[1] ? r.lowAnswered[0] / r.lowAnswered[1] : null) },
    { label: '70% · box', width: 85, align: 'right', cell: (r) => share(r.lowBoxes), sort: (r) => (r.lowBoxes[1] ? r.lowBoxes[0] / r.lowBoxes[1] : null) },
    { label: '70% · account', width: 105, align: 'right', cell: (r) => share(r.lowAccounts), sort: (r) => (r.lowAccounts[1] ? r.lowAccounts[0] / r.lowAccounts[1] : null) },
    { label: 'Credited boxes', width: 105, align: 'right', cell: (r) => tenths(r.creditedBoxes), sort: (r) => r.creditedBoxes },
    { label: 'Credited accounts', width: 125, align: 'right', cell: (r) => tenths(r.creditedAccounts), sort: (r) => r.creditedAccounts },
    { label: 'Meta spend', width: 85, align: 'right', cell: (r) => (r.meta ? dollars(r.meta.spend) : '—'), sort: (r) => r.meta?.spend ?? null },
    { label: 'Meta page views', width: 115, align: 'right', cell: (r) => (r.meta ? String(r.meta.landingPageViews) : '—'), sort: (r) => r.meta?.landingPageViews ?? null },
    { label: 'Meta add to cart', width: 115, align: 'right', cell: (r) => (r.meta ? String(r.meta.addToCart) : '—'), sort: (r) => r.meta?.addToCart ?? null },
    { label: 'Meta purchases', width: 105, align: 'right', cell: (r) => (r.meta ? String(r.meta.purchases) : '—'), sort: (r) => r.meta?.purchases ?? null },
    {
      label: '$ / credited account',
      width: 135,
      align: 'right',
      cell: (r) => (r.meta?.spend && r.creditedAccounts ? dollars(r.meta.spend / r.creditedAccounts) : '—'),
      sort: (r) => (r.meta?.spend && r.creditedAccounts ? r.meta.spend / r.creditedAccounts : null),
    },
  ];

  return (
    <View style={styles.sectionBody}>
      <ChipGroup
        value={jewishWeight}
        onChange={setJewishWeight}
        styles={styles}
        options={[
          ['0.5', 'Jewish ½ · Hanukkah ½'],
          ['0.667', 'Jewish ⅔ · Hanukkah ⅓'],
          ['0.75', 'Jewish ¾ · Hanukkah ¼'],
          ['1', 'Jewish only'],
        ]}
      />
      <ChipGroup
        value={cutoff}
        onChange={setCutoff}
        styles={styles}
        options={[
          ['40', 'Cutoff 40'],
          ['50', 'Cutoff 50'],
          ['60', 'Cutoff 60'],
        ]}
      />
      <View style={styles.chipRow}>
        <ChipGroup
          value={highCredit}
          onChange={setHighCredit}
          styles={styles}
          options={[
            ['0', '30% credit 0'],
            ['0.25', '30% credit ¼'],
            ['0.5', '30% credit ½'],
            ['0.75', '30% credit ¾'],
            ['1', '30% credit 1'],
          ]}
        />
        <ChipGroup
          value={unknownCredit}
          onChange={setUnknownCredit}
          styles={styles}
          options={[
            ['0.5', 'Unknown credit ½'],
            ['0.75', 'Unknown credit ¾'],
            ['1', 'Unknown credit 1'],
          ]}
        />
      </View>
      <SortTable<AdRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.ad}
        rowTone={(r) => (r.ad === ALL_ADS ? 'neutral' : undefined)}
        emptyMessage="No one has answered the questions or built a box yet."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`One row per ad (the ad name Meta passes as utm_content), plus a total. Visits without an ad name show their source instead: "From …" (a utm_source such as a newsletter), "Referral: …" (the referring site), "Direct / no tags" (landed with no tags), or "Not recorded" (no entry was saved for that visit). `}{`People = everyone who answered the onboarding questions or built a box; signed-up people count once, under the ad that first brought them. Purchases = committed box orders (not pending). Score = Jewish × weight + Hanukkah × the rest; below the cutoff counts as the 70%. Both sliders left at 50 (where they start), or no Jewish answer (accounts from before that question), counts as unknown fit. "70% · box" = low scorers out of people with a known score who built a box. Credited = each box or account counts 1 for the 70%, the 30% credit for the rest, and the unknown credit when we can't tell. Meta columns are Meta's own numbers for Grapejuice campaigns since Sept 1 (refreshed every 10 minutes): they include visitors whose ad tags we lost and aren't filtered by US only or Hide tests. "$ / credited account" = Meta spend ÷ credited accounts. Test accounts follow Hide tests; anonymous test visits can't be told apart.`}
      </Text>
    </View>
  );
}

/** The box builder's email gate went live (10:30am ET). */
const GATE_LIVE_MS = Date.parse('2026-10-08T14:30:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

type FunnelKey = 'opened' | 'family' | 'sliders' | 'gateEmail' | 'sawBox' | 'account' | 'card' | 'purchase';
const FUNNEL_STEPS: ReadonlyArray<{ key: FunnelKey; label: string; short: string }> = [
  { key: 'opened', label: 'Opened the box builder', short: 'Opened' },
  { key: 'family', label: 'Finished “Your family”', short: 'Family' },
  { key: 'sliders', label: 'Finished the sliders (box built)', short: 'Box built' },
  { key: 'gateEmail', label: 'Entered email at the gate', short: 'Gate email' },
  { key: 'sawBox', label: 'Saw their box', short: 'Saw box' },
  { key: 'account', label: 'Has an account', short: 'Accounts' },
  { key: 'card', label: 'Added a card', short: 'Cards' },
  { key: 'purchase', label: 'Ordered', short: 'Orders' },
];
const reachedStep = (p: DashFunnelPerson, k: FunnelKey) => k === 'opened' || p[k];
const countStep = (people: DashFunnelPerson[], k: FunnelKey) => people.filter((p) => reachedStep(p, k)).length;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
const firstSeenMs = (p: DashFunnelPerson) => (p.firstSeen ? Date.parse(p.firstSeen) : NaN);

type FunnelWindow = 'day' | 'week' | 'gate' | 'all';
const FUNNEL_WINDOWS: Array<[FunnelWindow, string]> = [
  ['day', 'Last 24 hours'],
  ['week', 'Last 7 days'],
  ['gate', 'Since the email gate'],
  ['all', 'All saved'],
];

function windowStart(w: FunnelWindow, now: number): number {
  if (w === 'day') return now - DAY_MS;
  if (w === 'week') return now - 7 * DAY_MS;
  if (w === 'gate') return GATE_LIVE_MS;
  return -Infinity;
}

const etDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const COMPARE_STEPS: ReadonlyArray<{ key: FunnelKey | 'anyEmail'; label: string }> = [
  { key: 'sliders', label: 'Finished the sliders (box built)' },
  { key: 'sawBox', label: 'Saw their box' },
  { key: 'anyEmail', label: 'Gave an email (gate, account or Retention)' },
  { key: 'account', label: 'Has an account' },
  { key: 'card', label: 'Added a card' },
  { key: 'purchase', label: 'Ordered' },
];

type CompareRow = { key: FunnelKey | 'anyEmail'; label: string; before: number; after: number };
type DayRow = { day: string; people: DashFunnelPerson[] };

/** Horizontal funnel bars out of the first step, with the biggest step-to-step loss called out. */
function FunnelBars({
  steps,
  emptyMessage,
  styles,
  colors,
}: {
  steps: ReadonlyArray<{ key: string; label: string; count: number }>;
  emptyMessage: string;
  styles: Styles;
  colors: SemanticColors;
}) {
  const top = steps[0]?.count ?? 0;
  let biggest = -1;
  let drop = 0;
  steps.forEach((s, i) => {
    const lost = i > 0 ? steps[i - 1].count - s.count : 0;
    if (lost > drop) {
      biggest = i;
      drop = lost;
    }
  });
  if (top === 0) return <Text style={styles.hint}>{emptyMessage}</Text>;
  return (
    <>
      {biggest > 0 ? (
        <Text style={styles.hint}>
          <Text style={[styles.tdStrong, { color: colors.error }]}>Biggest drop-off: </Text>
          {`${drop} of ${steps[biggest - 1].count} (${pct(drop, steps[biggest - 1].count)}) left between “${steps[biggest - 1].label}” and “${steps[biggest].label}”.`}
        </Text>
      ) : null}
      <View style={styles.funnel}>
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].count : null;
          const lost = prev == null ? 0 : prev - s.count;
          const isBiggest = i === biggest;
          return (
            <View key={s.key} style={styles.funnelRow}>
              <Text style={[styles.td, styles.funnelLabel, isBiggest && styles.tdStrong]} numberOfLines={2}>
                {s.label}
              </Text>
              <View style={styles.funnelTrack}>
                <View
                  style={[
                    styles.funnelFill,
                    { width: `${(s.count / top) * 100}%`, backgroundColor: isBiggest ? colors.error : colors.brand },
                  ]}
                />
              </View>
              <Text style={[styles.td, styles.tdStrong, styles.funnelNum]}>{String(s.count)}</Text>
              <Text style={[styles.tdMuted, styles.funnelNum]}>{pct(s.count, top)}</Text>
              <Text style={[styles.tdMuted, styles.funnelDrop, isBiggest && { color: colors.error }]}>
                {prev == null ? '' : lost > 0 ? `−${lost} (${pct(lost, prev)})` : lost < 0 ? `+${-lost}` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

type GiftStepKey = 'visited' | GiftFunnelKey;
const GIFT_STEPS: ReadonlyArray<{ key: GiftStepKey; label: string; short: string; curatedOnly?: boolean }> = [
  { key: 'visited', label: 'Visited /gift or the gift flow', short: 'Visited' },
  { key: 'start', label: 'Started the gift flow', short: 'Started' },
  { key: 'path', label: 'Chose credit or a curated box', short: 'Chose' },
  { key: 'family', label: 'Finished their family step', short: 'Family' },
  { key: 'email', label: 'Entered their email', short: 'Email', curatedOnly: true },
  { key: 'box', label: 'Opened the box editor', short: 'Box editor', curatedOnly: true },
  { key: 'note', label: 'Reached the note', short: 'Note' },
  { key: 'send', label: 'Reached “Where should we send it?”', short: 'Recipient' },
  { key: 'checkout', label: 'Opened payment', short: 'Payment' },
  { key: 'paid', label: 'Paid', short: 'Paid' },
  { key: 'claimed', label: 'Recipient claimed it', short: 'Claimed' },
];
const giftReached = (p: DashGiftFunnelPerson, k: GiftStepKey) => k === 'visited' || p.reached.includes(k);
const giftCount = (people: DashGiftFunnelPerson[], k: GiftStepKey) => people.filter((p) => giftReached(p, k)).length;
const giftFirstMs = (p: DashGiftFunnelPerson) => (p.firstSeen ? Date.parse(p.firstSeen) : NaN);

function giftFurthest(p: DashGiftFunnelPerson): string {
  const last = [...GIFT_STEPS].reverse().find((s) => s.key !== 'visited' && p.reached.includes(s.key as GiftFunnelKey));
  return last ? last.short : 'Saw /gift only';
}

type GiftPathFilter = 'any' | 'credit' | 'curated';
type GiftWindow = 'day' | 'week' | 'all';
const GIFT_WINDOWS: Array<[GiftWindow, string]> = [
  ['day', 'Last 24 hours'],
  ['week', 'Last 7 days'],
  ['all', 'All saved'],
];
type GiftCompareRow = { key: GiftStepKey; label: string; credit: number; curated: number };
type GiftDayRow = { day: string; people: DashGiftFunnelPerson[] };
const GIFT_DAY_STEPS: GiftStepKey[] = ['visited', 'start', 'path', 'family', 'send', 'checkout', 'paid'];

function GiftFunnelSection({
  people,
  hideTests,
  now,
  styles,
  colors,
}: {
  people: DashGiftFunnelPerson[];
  hideTests: boolean;
  now: number;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [win, setWin] = useState<GiftWindow>('week');
  const [path, setPath] = useState<GiftPathFilter>('any');
  const pool = useMemo(() => people.filter((p) => !(hideTests && p.test)), [people, hideTests]);
  const inWindow = useMemo(() => {
    const start = win === 'day' ? now - DAY_MS : win === 'week' ? now - 7 * DAY_MS : -Infinity;
    return pool.filter((p) => giftFirstMs(p) >= start);
  }, [pool, win, now]);
  const shown = path === 'any' ? inWindow : inWindow.filter((p) => p.path === path);
  const steps = GIFT_STEPS.filter((s) => path === 'curated' || !s.curatedOnly).map((s) => ({
    ...s,
    count: giftCount(shown, s.key),
  }));
  const sawLanding = shown.filter((p) => p.landing).length;

  const credit = inWindow.filter((p) => p.path === 'credit');
  const curated = inWindow.filter((p) => p.path === 'curated');
  const compareRows: GiftCompareRow[] = GIFT_STEPS.filter((s) => s.key !== 'visited' && s.key !== 'start' && s.key !== 'path').map(
    (s) => ({
      key: s.key,
      label: s.label,
      credit: s.curatedOnly ? NaN : giftCount(credit, s.key),
      curated: giftCount(curated, s.key),
    }),
  );
  const per100 = (n: number, of: number) => (Number.isNaN(n) ? 'n/a' : of ? `${Math.round((n / of) * 100)}  (${n})` : '—');
  const compareColumns: Column<GiftCompareRow>[] = [
    { label: 'Step', width: 290, cell: (r) => r.label },
    { label: `Credit (${credit.length} chose it)`, width: 180, align: 'right', cell: (r) => per100(r.credit, credit.length) },
    { label: `Curated box (${curated.length} chose it)`, width: 200, align: 'right', cell: (r) => per100(r.curated, curated.length) },
  ];

  const days: GiftDayRow[] = useMemo(() => {
    const byDay = new Map<string, DashGiftFunnelPerson[]>();
    for (const p of pool) {
      const t = giftFirstMs(p);
      if (!Number.isFinite(t) || t < now - 14 * DAY_MS) continue;
      const d = etDay(t);
      byDay.set(d, [...(byDay.get(d) ?? []), p]);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, ps]) => ({ day, people: ps }));
  }, [pool, now]);
  const dayColumns: Column<GiftDayRow>[] = [
    { label: 'Day (ET)', width: 100, cell: (r) => r.day, sort: (r) => r.day },
    ...GIFT_DAY_STEPS.map((k): Column<GiftDayRow> => {
      const count = (r: GiftDayRow) => giftCount(r.people, k);
      return {
        label: GIFT_STEPS.find((s) => s.key === k)?.short ?? k,
        width: 85,
        align: 'right',
        cell: (r) => String(count(r)),
        sort: count,
      };
    }),
  ];

  const pathLabel = (p: DashGiftFunnelPerson) => (p.path === 'credit' ? 'Credit' : p.path === 'curated' ? 'Curated box' : '—');
  const peopleColumns: Column<DashGiftFunnelPerson>[] = [
    { label: 'Last seen', width: 130, cell: (p) => when(p.lastSeen), sort: (p) => p.lastSeen },
    { label: 'First seen', width: 130, cell: (p) => when(p.firstSeen), sort: (p) => p.firstSeen },
    { label: 'Got to', width: 110, cell: (p) => giftFurthest(p), sort: (p) => p.reached.length },
    { label: 'Gift', width: 100, cell: pathLabel, sort: pathLabel },
    { label: 'Kids', width: 50, align: 'right', cell: (p) => (p.kids == null ? '—' : String(p.kids)), sort: (p) => p.kids },
    { label: 'Items', width: 55, align: 'right', cell: (p) => (p.items ? String(p.items) : '—'), sort: (p) => p.items },
    { label: 'Source', width: 220, cell: (p) => p.ad, sort: (p) => p.ad },
    { label: 'Location', width: 110, cell: (p) => p.location ?? '—', sort: (p) => p.location },
    { label: 'Signed in', width: 80, cell: (p) => (p.signedIn ? 'Yes' : '—'), sort: (p) => (p.signedIn ? 1 : 0) },
    { label: 'Data', width: 90, cell: (p) => (p.tracked ? 'Tracked' : 'From draft'), sort: (p) => (p.tracked ? 1 : 0) },
  ];

  return (
    <View style={styles.sectionBody}>
      <ChipGroup value={win} onChange={setWin} options={GIFT_WINDOWS} styles={styles} />
      <ChipGroup
        value={path}
        onChange={setPath}
        options={[
          ['any', 'Either gift'],
          ['credit', 'Credit'],
          ['curated', 'Curated box'],
        ]}
        styles={styles}
      />
      <FunnelBars steps={steps} emptyMessage="No one opened a gift page in this window." styles={styles} colors={colors} />
      <Text style={styles.caption}>
        {`Everyone who opened a gift page, by when we first saw them; ${sawLanding} of ${shown.length} came through the /gift landing page. Reaching a step counts the ones before it. Step tracking (signed in or not, including the /gift landing page) started the evening of Oct 8; before that, only signed-out visitors who chose a gift were saved, and they're placed by the page they stopped on ("From draft" below), so landing-only visits and anyone who signed in mid-flow are missing from earlier days. Email and box editor only exist on the curated path, so "Either gift" skips them. Paid and claimed come from the gift's checkout record. US only and Hide tests apply; anonymous test visits can't be told apart.`}
      </Text>

      <Text style={styles.section}>Credit vs. curated box</Text>
      <SortTable<GiftCompareRow>
        columns={compareColumns}
        rows={compareRows}
        rowKey={(r) => r.key}
        emptyMessage="No one chose a gift yet."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>Per 100 people who chose that gift in this window, with the count in brackets.</Text>

      <Text style={styles.section}>By day</Text>
      <SortTable<GiftDayRow>
        columns={dayColumns}
        rows={days}
        rowKey={(r) => r.day}
        emptyMessage="No gift visitors in the last 14 days."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>Last 14 days, by the day we first saw each visitor (Eastern time).</Text>

      <Text style={styles.section}>{`People (${shown.length})`}</Text>
      <SortTable<DashGiftFunnelPerson>
        columns={peopleColumns}
        rows={shown}
        rowKey={(p) => p.id}
        rowTone={(p) => (p.reached.includes('paid') ? 'success' : p.reached.includes('send') ? 'warning' : undefined)}
        emptyMessage="No gift visitors match these filters."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`One row per browser, most recent first. Got to = the furthest step reached. Kids = kids in the curated box, or kids the credit covers. Items = items in a saved curated box. Dot: green paid, amber reached the recipient step but didn't pay.`}
      </Text>
    </View>
  );
}

function FunnelSection({
  people,
  hideTests,
  now,
  styles,
  colors,
}: {
  people: DashFunnelPerson[];
  hideTests: boolean;
  now: number;
  styles: Styles;
  colors: SemanticColors;
}) {
  const [win, setWin] = useState<FunnelWindow>('gate');
  const pool = useMemo(() => people.filter((p) => !(hideTests && p.test)), [people, hideTests]);
  const inWindow = useMemo(() => {
    const start = windowStart(win, now);
    return pool.filter((p) => firstSeenMs(p) >= start);
  }, [pool, win, now]);

  const steps = FUNNEL_STEPS.map((s) => ({ ...s, count: countStep(inWindow, s.key) }));

  const before = pool.filter((p) => firstSeenMs(p) < GATE_LIVE_MS && p.family);
  const after = pool.filter((p) => firstSeenMs(p) >= GATE_LIVE_MS && p.family);
  const beforeStart = before.reduce((m, p) => Math.min(m, firstSeenMs(p)), Infinity);
  const compareRows: CompareRow[] = COMPARE_STEPS.map(({ key, label }) => {
    const has = (p: DashFunnelPerson) => (key === 'anyEmail' ? p.anyEmail : reachedStep(p, key));
    return { key, label, before: before.filter(has).length, after: after.filter(has).length };
  });
  const per100 = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}  (${n})` : '—');
  const hoursBefore = Number.isFinite(beforeStart) ? Math.round((GATE_LIVE_MS - beforeStart) / 3_600_000) : 0;
  const hoursAfter = Math.max(0, Math.round((now - GATE_LIVE_MS) / 3_600_000));

  const days: DayRow[] = useMemo(() => {
    const byDay = new Map<string, DashFunnelPerson[]>();
    for (const p of pool) {
      const t = firstSeenMs(p);
      if (!Number.isFinite(t) || t < now - 14 * DAY_MS) continue;
      const d = etDay(t);
      byDay.set(d, [...(byDay.get(d) ?? []), p]);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, ps]) => ({ day, people: ps }));
  }, [pool, now]);

  const dayCount = (k: FunnelKey) => (r: DayRow) => countStep(r.people, k);
  const dayColumns: Column<DayRow>[] = [
    { label: 'Day (ET)', width: 100, cell: (r) => r.day, sort: (r) => r.day },
    ...FUNNEL_STEPS.map(
      (s): Column<DayRow> => ({
        label: s.short,
        width: 80,
        align: 'right',
        cell: (r) => String(dayCount(s.key)(r)),
        sort: dayCount(s.key),
      }),
    ),
    {
      label: 'Gate pass',
      width: 85,
      align: 'right',
      cell: (r) => {
        const built = r.people.filter((p) => p.sliders && firstSeenMs(p) >= GATE_LIVE_MS);
        return built.length ? pct(built.filter((p) => p.gateEmail).length, built.length) : '—';
      },
    },
  ];

  const compareColumns: Column<CompareRow>[] = [
    { label: 'Step', width: 290, cell: (r) => r.label },
    { label: `Before the gate (${before.length} in ${hoursBefore}h)`, width: 200, align: 'right', cell: (r) => per100(r.before, before.length) },
    { label: `With the gate (${after.length} in ${hoursAfter}h)`, width: 200, align: 'right', cell: (r) => per100(r.after, after.length) },
  ];

  return (
    <View style={styles.sectionBody}>
      <ChipGroup value={win} onChange={setWin} options={FUNNEL_WINDOWS} styles={styles} />
      <FunnelBars steps={steps} emptyMessage="No one opened the box builder in this window." styles={styles} colors={colors} />
      <Text style={styles.caption}>
        {`Signed-out visitors who opened the box builder, by when we first saved them. Bars and % are out of everyone who opened it; the right column is how many left since the step before. Visitors who leave on the family screen are saved only from Oct 8 (evening); before that, "Opened" only counts people who got past it. "Entered email at the gate" only exists from Oct 8, 10:30am ET. Signed-in builders aren't included (they skip the gate). US only and Hide tests apply; anonymous test visits can't be told apart.`}
      </Text>

      <Text style={styles.section}>Before vs. with the email gate</Text>
      <SortTable<CompareRow>
        columns={compareColumns}
        rows={compareRows}
        rowKey={(r) => r.key}
        emptyMessage="No sessions yet."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`Per 100 people who finished “Your family”, with the count in brackets. Before = saved sessions from the first one on record until the gate went live (Oct 8, 10:30am ET); with = since then. Newer sessions have had less time to come back, add a card, or order.`}
      </Text>

      <Text style={styles.section}>By day</Text>
      <SortTable<DayRow>
        columns={dayColumns}
        rows={days}
        rowKey={(r) => r.day}
        emptyMessage="No sessions in the last 14 days."
        styles={styles}
        colors={colors}
      />
      <Text style={styles.caption}>
        {`Last 14 days, by the day we first saved each visitor (Eastern time). Gate pass = gate emails out of boxes built since the gate went live.`}
      </Text>
    </View>
  );
}

type Tab = 'boxes' | 'funnel' | 'giftFunnel' | 'anonymous' | 'ads' | 'gifts' | 'inventory' | PromotionsTab;
const TABS: readonly Tab[] = [
  'boxes',
  'funnel',
  'giftFunnel',
  'anonymous',
  'ads',
  'gifts',
  'inventory',
  'discounts',
  'credit',
  'influencers',
];
const TAB_STORAGE_KEY = 'gj.adminBoxes.tab';

/** The open tab survives a browser refresh of /admin/boxes. */
function readStoredTab(): Tab {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(TAB_STORAGE_KEY) : null;
    return TABS.includes(raw as Tab) ? (raw as Tab) : 'boxes';
  } catch {
    return 'boxes';
  }
}

function storeTab(tab: Tab): void {
  try {
    if (typeof window !== 'undefined') window.sessionStorage?.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // Private mode / native: tab just resets on reload.
  }
}

/** Ops dashboard of Hanukkah boxes, gifts and inventory holds — admin-gated, refreshes every minute. */
export function AdminBoxesScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isOpsAdmin(user);
  const { data, error, refreshing, refresh } = useBoxesDashboard(allowed);
  const hostRef = useRef<View>(null);
  // Stack screens on web grow to content height; pin to the viewport so the ScrollView scrolls (iOS especially).
  const pinnedHeight = useViewportPinnedHeight(hostRef, true);
  const hostStyle = [styles.host, pinnedHeight != null ? { height: pinnedHeight, maxHeight: pinnedHeight } : null];
  const [tab, setTabState] = useState<Tab>(readStoredTab);
  const setTab = (next: Tab) => {
    setTabState(next);
    storeTab(next);
  };
  const [hideTests, setHideTests] = useState(true);
  const [usOnly, setUsOnly] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const inventory = useMemo(() => (data ? inventoryFor(data, hideTests) : []), [data, hideTests]);
  const inventoryById = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);
  // Inventory keeps every row: stock held by a non-US box is still held.
  const shown = useMemo(
    () =>
      data && usOnly
        ? {
            ...data,
            boxes: data.boxes.filter((b) => !b.outsideUs),
            guests: data.guests.filter((g) => !g.outsideUs),
            gifts: data.gifts.filter((g) => !g.outsideUs),
            adPeople: (data.adPeople ?? []).filter((p) => !p.outsideUs),
            funnel: (data.funnel ?? []).filter((p) => !p.outsideUs),
            giftFunnel: (data.giftFunnel ?? []).filter((p) => !p.outsideUs),
          }
        : data,
    [data, usOnly],
  );

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  if (!allowed) {
    return (
      <View ref={hostRef} style={hostStyle}>
        <WebContentPanel {...panelProps}>
          <View style={styles.centered}>
            <Text style={styles.title}>Admin only</Text>
            <Text style={styles.hint}>This page is limited to allowlisted ops accounts.</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
          </View>
        </WebContentPanel>
      </View>
    );
  }

  if (!data) {
    return (
      <View ref={hostRef} style={hostStyle}>
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
      </View>
    );
  }

  const view = shown ?? data;
  const real = view.boxes.filter((b) => !b.playthrough && !(hideTests && b.test));
  const liveOrders = real.filter((b) => b.source === 'order' && LIVE.includes(b.status));
  const openDrafts = real.filter((b) => b.status === 'draft');
  const noCard = [...liveOrders, ...openDrafts].filter((b) => !b.cardOnFile);
  const realGifts = view.gifts.filter((g) => !g.playthrough && !(hideTests && g.test));
  const atZero = inventory.filter((i) => i.remaining != null && i.remaining <= 0);
  const negAfterDrafts = inventory.filter((i) => i.remainingAfterDrafts != null && i.remainingAfterDrafts < 0);
  const testBoxes = view.boxes.filter((b) => b.test && !b.playthrough).length;
  const testGifts = view.gifts.filter((g) => g.test && !g.playthrough).length;
  const outsideBoxes = data.boxes.filter((b) => b.outsideUs && !b.playthrough && !(hideTests && b.test)).length;
  const outsideGuests = data.guests.filter((g) => g.outsideUs).length;
  const outsideGifts = data.gifts.filter((g) => g.outsideUs && !g.playthrough && !(hideTests && g.test)).length;
  const openGuests = view.guests.filter((g) => !g.converted);
  const guestBoxes = openGuests.filter((g) => g.stage === 'built' || g.stage === 'revealed');
  const guestLeads = openGuests.filter((g) => g.leadAt);
  const giftStarters = (view.giftFunnel ?? []).filter((p) => !(hideTests && p.test) && p.reached.includes('start')).length;
  const liveRevenue = liveOrders.reduce((s, b) => s + (b.totalCents ?? 0), 0);
  const draftValue = openDrafts.reduce((s, b) => s + (b.subtotalCents ?? 0), 0);

  return (
    <View ref={hostRef} style={hostStyle}>
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
              <Chip
                label={`US only · ${outsideBoxes} boxes, ${outsideGuests} anonymous, ${outsideGifts} gifts outside`}
                active={usOnly}
                onPress={() => setUsOnly((v) => !v)}
                styles={styles}
              />
            </View>
            <Text style={styles.meta}>
              US only hides rows known to be outside the US: a non-US ship-to address, else a non-US IP. Rows with no location stay in. Inventory is unaffected.
            </Text>
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
              value={String(guestBoxes.length)}
              label={`Anonymous boxes (not signed up) · ${openGuests.length - guestBoxes.length} more started, ${guestLeads.length} identified by Retention.com`}
              styles={styles}
              colors={colors}
            />
            <Stat
              value={`${realGifts.filter((g) => g.paid).length} / ${realGifts.filter((g) => g.claimed).length}`}
              label={`Gifts paid / claimed · ${giftStarters} started the gift flow`}
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
            <Chip label="Box funnel" active={tab === 'funnel'} onPress={() => setTab('funnel')} styles={styles} />
            <Chip label="Gift funnel" active={tab === 'giftFunnel'} onPress={() => setTab('giftFunnel')} styles={styles} />
            <Chip label={`Anonymous (${openGuests.length})`} active={tab === 'anonymous'} onPress={() => setTab('anonymous')} styles={styles} />
            <Chip label="By ad" active={tab === 'ads'} onPress={() => setTab('ads')} styles={styles} />
            <Chip label={`Gifts (${realGifts.length})`} active={tab === 'gifts'} onPress={() => setTab('gifts')} styles={styles} />
            <Chip label={`Inventory (${inventory.length})`} active={tab === 'inventory'} onPress={() => setTab('inventory')} styles={styles} />
            <Chip label="Discounts" active={tab === 'discounts'} onPress={() => setTab('discounts')} styles={styles} />
            <Chip label="Credit" active={tab === 'credit'} onPress={() => setTab('credit')} styles={styles} />
            <Chip label="Influencers" active={tab === 'influencers'} onPress={() => setTab('influencers')} styles={styles} />
          </View>

          {tab === 'boxes' ? (
            <>
              <Text style={styles.section}>Boxes</Text>
              <BoxesSection data={view} hideTests={hideTests} inventoryById={inventoryById} styles={styles} colors={colors} />
            </>
          ) : null}
          {tab === 'funnel' ? (
            <>
              <Text style={styles.section}>Box builder funnel: where people drop off</Text>
              <FunnelSection people={view.funnel ?? []} hideTests={hideTests} now={now} styles={styles} colors={colors} />
            </>
          ) : null}
          {tab === 'giftFunnel' ? (
            <>
              <Text style={styles.section}>Gift funnel: where gift givers drop off</Text>
              <GiftFunnelSection people={view.giftFunnel ?? []} hideTests={hideTests} now={now} styles={styles} colors={colors} />
            </>
          ) : null}
          {tab === 'anonymous' ? (
            <>
              <Text style={styles.section}>Anonymous boxes</Text>
              <AnonymousSection
                guests={view.guests}
                totalSessions={data.counts.guestSessions}
                inventoryById={inventoryById}
                styles={styles}
                colors={colors}
              />
            </>
          ) : null}
          {tab === 'ads' ? (
            <>
              <Text style={styles.section}>By ad: how far people get, and who they are</Text>
              <AdsSection people={view.adPeople ?? []} metaByAd={data.metaByAd ?? null} hideTests={hideTests} styles={styles} colors={colors} />
            </>
          ) : null}
          {tab === 'gifts' ? (
            <>
              <Text style={styles.section}>Gifts</Text>
              <GiftsSection data={view} hideTests={hideTests} inventoryById={inventoryById} styles={styles} colors={colors} />
            </>
          ) : null}
          {tab === 'inventory' ? (
            <>
              <Text style={styles.section}>Inventory against holds and drafts</Text>
              <InventorySection inventory={inventory} styles={styles} colors={colors} />
            </>
          ) : null}
          {tab === 'discounts' || tab === 'credit' || tab === 'influencers' ? (
            <>
              <Text style={styles.section}>
                {tab === 'discounts' ? 'Discount codes' : tab === 'credit' ? 'Direct credit' : 'Influencer links'}
              </Text>
              <PromotionsSection tab={tab} />
            </>
          ) : null}
        </ScrollView>
      </WebContentPanel>
    </View>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    host: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    panel: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
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
    funnel: { gap: spacing.xs, marginTop: spacing.xs },
    funnelRow: { flexDirection: 'row', alignItems: 'center', flexWrap: isDesktop ? 'nowrap' : 'wrap', gap: spacing.sm },
    funnelLabel: { width: isDesktop ? 240 : '100%' },
    funnelTrack: {
      flexGrow: 1,
      flexBasis: isDesktop ? 0 : 140,
      minWidth: 0,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    funnelFill: { height: '100%', borderRadius: 9 },
    funnelNum: { width: 44, textAlign: 'right' },
    funnelDrop: { width: 96, textAlign: 'right' },
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
