import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
  PACKING_SIZE_LABEL,
  setPackingLinePacked,
  setPackingSize,
  useAdminPacking,
  type PackingKind,
  type PackingLine,
  type PackingPackage,
  type PackingSize,
} from '../../services/admin/packing';

type Nav = StackNavigationProp<MainStackParamList>;
type Styles = ReturnType<typeof createStyles>;
type KindFilter = 'all' | PackingKind;
type ViewMode = 'box' | 'product';
type GroupBy = 'size' | 'none';
type SortBy = 'size' | 'recipient' | 'left' | 'weight';
type SortDir = 'asc' | 'desc';

const SIZE_ORDER: PackingSize[] = ['14x14x6', '14x14x12', '10x8x6'];
const SIZE_OPTIONS: PackingSize[] = ['14x14x6', '14x14x12', '10x8x6'];
const SORT_DEFAULT_DIR: Record<SortBy, SortDir> = { size: 'asc', recipient: 'asc', left: 'desc', weight: 'desc' };
const CATEGORY_ORDER = ['Book', 'Menorah', 'Dreidel', 'Candles', 'Gelt', 'Food', 'Stuffies', 'Toys', 'Other'];
const KIND_LABEL: Record<PackingKind, string> = { box: 'Box', shop: 'Shop', gift: 'Gift' };
const ORIGIN_LABEL: Record<NonNullable<PackingLine['origin']>, string> = {
  default: 'Default',
  changed: 'Swapped',
  added: 'Added',
};

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

const unpackedLines = (p: PackingPackage) => p.lines.filter((l) => !l.packed).length;
const isDone = (p: PackingPackage) => p.lines.length > 0 && unpackedLines(p) === 0;

function packageWeight(p: PackingPackage): { oz: number; estimated: boolean } {
  let oz = 0;
  let estimated = false;
  for (const line of p.lines) {
    oz += line.qty * (line.weightOz ?? 0);
    if (line.weightEstimated) estimated = true;
  }
  return { oz, estimated };
}

function formatOz(oz: number): string {
  if (oz < 16) return `${Math.round(oz)} oz`;
  const lb = Math.round((oz / 16) * 10) / 10;
  return `${lb} lb`;
}

/** Ops packing list: paid boxes, shop orders and gifts, with box sizes and a shared packed checkbox per item. */
export function AdminPackingScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useThemeMode();
  const { isDesktop } = useWebLayout();
  const styles = useMemo(() => createStyles(colors, isDesktop), [colors, isDesktop]);
  const user = useAuthStore((s) => s.user);
  const allowed = isOpsAdmin(user);
  const { data, setData, error, refreshing, refresh } = useAdminPacking(allowed);
  const hostRef = useRef<View>(null);
  const pinnedHeight = useViewportPinnedHeight(hostRef, true);
  const hostStyle = [styles.host, pinnedHeight != null ? { height: pinnedHeight, maxHeight: pinnedHeight } : null];

  const [kind, setKind] = useState<KindFilter>('all');
  const [showTests, setShowTests] = useState(false);
  const [view, setView] = useState<ViewMode>('box');
  const [groupBy, setGroupBy] = useState<GroupBy>('size');
  const [sortBy, setSortBy] = useState<SortBy>('size');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [categories, setCategories] = useState<string[]>([]);
  const [hideDone, setHideDone] = useState(false);
  const [focusPackageId, setFocusPackageId] = useState<string | null>(null);
  const [simulatePostLock, setSimulatePostLock] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const panelProps = {
    flush: isDesktop,
    centerDesktop: isDesktop,
    omitDesktopTopPadding: isDesktop,
    style: styles.panel,
  } as const;

  const visible = useMemo(
    () =>
      (data?.packages ?? []).filter(
        (p) =>
          (showTests || !p.test) &&
          (kind === 'all' || p.kind === kind) &&
          (simulatePostLock || !p.awaitingPayment),
      ),
    [data, kind, showTests, simulatePostLock],
  );

  const totals = useMemo(() => {
    const lines = visible.reduce((s, p) => s + p.lines.length, 0);
    const packed = visible.reduce((s, p) => s + p.lines.filter((l) => l.packed).length, 0);
    const bySize = Object.fromEntries(SIZE_ORDER.map((s) => [s, 0])) as Record<PackingSize, number>;
    for (const p of visible) bySize[p.size] += 1;
    return {
      box: visible.filter((p) => p.kind === 'box').length,
      shop: visible.filter((p) => p.kind === 'shop').length,
      gift: visible.filter((p) => p.kind === 'gift').length,
      lines,
      packed,
      bySize,
    };
  }, [visible]);

  /** Optimistic local update, then the shared write. Reverts and reports if the write fails. */
  const toggleLine = (pkg: PackingPackage, line: PackingLine) => {
    const next = !line.packed;
    const apply = (value: boolean) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              packages: prev.packages.map((p) =>
                p.id !== pkg.id
                  ? p
                  : { ...p, lines: p.lines.map((l) => (l.key === line.key ? { ...l, packed: value } : l)) },
              ),
            }
          : prev,
      );
    apply(next);
    setSaveError(null);
    setPackingLinePacked(pkg.id, line.key, next).catch((err: unknown) => {
      apply(!next);
      setSaveError(err instanceof Error ? err.message : 'Could not save the packed check.');
    });
  };

  const pressSort = (next: SortBy) => {
    if (sortBy === next) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(next);
    setSortDir(SORT_DEFAULT_DIR[next]);
  };

  const sortChip = (label: string, key: SortBy) => (sortBy === key ? `${label} ${sortDir === 'asc' ? '↑' : '↓'}` : label);

  const openPackage = (id: string) => {
    setView('box');
    setFocusPackageId(id);
  };

  useEffect(() => {
    if (view !== 'box' || !focusPackageId) return;
    const id = focusPackageId;
    const frame = requestAnimationFrame(() => {
      if (typeof document !== 'undefined') {
        document.getElementById(`packing-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      setFocusPackageId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [view, focusPackageId]);

  const chooseSize = (pkg: PackingPackage, size: PackingSize) => {
    if (size === pkg.size && pkg.sizeSet) return;
    const previous = pkg.size;
    const apply = (value: PackingSize) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              packages: prev.packages.map((p) => (p.id === pkg.id ? { ...p, size: value, sizeSet: true } : p)),
            }
          : prev,
      );
    apply(size);
    setSaveError(null);
    setPackingSize(pkg.id, size).catch((err: unknown) => {
      apply(previous);
      setSaveError(err instanceof Error ? err.message : 'Could not save the box size.');
    });
  };

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

  const listed = visible.filter((p) => !hideDone || !isDone(p));

  return (
    <View ref={hostRef} style={hostStyle}>
      <WebContentPanel {...panelProps}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.backLink}>← Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void refresh()} disabled={refreshing} hitSlop={12}>
              <Text style={styles.backLink}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Packing</Text>
          <Text style={styles.caption}>
            Paid boxes (charged at lock), paid shop orders and paid gift boxes with a ship-to address. Checkmarks are shared
            with everyone who opens this page. Updated {when(data.generatedAt)}.
            {simulatePostLock
              ? ' Simulate Post-Lock adds committed boxes whose cards have not been charged yet. They are a preview, not paid orders.'
              : ''}
          </Text>

          <View style={styles.statRow}>
            <Stat styles={styles} label="Box orders" value={totals.box} />
            <Stat styles={styles} label="Shop orders" value={totals.shop} />
            <Stat styles={styles} label="Gifts" value={totals.gift} />
            <Stat styles={styles} label="Items packed" value={`${totals.packed} / ${totals.lines}`} />
            {SIZE_ORDER.map((s) => (
              <Stat key={s} styles={styles} label={PACKING_SIZE_LABEL[s]} value={totals.bySize[s]} />
            ))}
          </View>

          <Text style={styles.section}>Show</Text>
          <ChipRow styles={styles}>
            {(['all', 'box', 'shop', 'gift'] as KindFilter[]).map((k) => (
              <Chip
                key={k}
                styles={styles}
                label={k === 'all' ? 'All' : k === 'box' ? 'Box orders' : k === 'shop' ? 'Shop orders' : 'Gifts'}
                active={kind === k}
                onPress={() => setKind(k)}
              />
            ))}
            <Chip styles={styles} label="Simulate Post-Lock" active={simulatePostLock} onPress={() => setSimulatePostLock((v) => !v)} />
            <Chip styles={styles} label={showTests ? 'Test orders: on' : 'Test orders: off'} active={showTests} onPress={() => setShowTests((v) => !v)} />
            <Chip styles={styles} label={hideDone ? 'Hiding packed' : 'Hide packed'} active={hideDone} onPress={() => setHideDone((v) => !v)} />
          </ChipRow>

          <Text style={styles.section}>View</Text>
          <ChipRow styles={styles}>
            <Chip styles={styles} label="By box" active={view === 'box'} onPress={() => setView('box')} />
            <Chip styles={styles} label="By product" active={view === 'product'} onPress={() => setView('product')} />
          </ChipRow>

          {view === 'box' ? (
            <>
              <Text style={styles.section}>Group and sort</Text>
              <ChipRow styles={styles}>
                <Chip styles={styles} label="Group: box size" active={groupBy === 'size'} onPress={() => setGroupBy('size')} />
                <Chip styles={styles} label="No groups" active={groupBy === 'none'} onPress={() => setGroupBy('none')} />
                <Chip styles={styles} label={sortChip('Sort: box size', 'size')} active={sortBy === 'size'} onPress={() => pressSort('size')} />
                <Chip styles={styles} label={sortChip('Sort: name', 'recipient')} active={sortBy === 'recipient'} onPress={() => pressSort('recipient')} />
                <Chip styles={styles} label={sortChip('Sort: most left', 'left')} active={sortBy === 'left'} onPress={() => pressSort('left')} />
                <Chip styles={styles} label={sortChip('Sort: weight', 'weight')} active={sortBy === 'weight'} onPress={() => pressSort('weight')} />
              </ChipRow>
              <Text style={styles.caption}>
                Box size: 14 × 14 × 6 is the default for boxes and gifts; 10 × 8 × 6 is for shop orders. Packages marked
                “May need a large box” have an item over 12 in or a lot of units. Pick a bigger box if they won’t fit. Weight uses
                catalog weights. A ~ means part of the total is estimated; a book without a weight counts as 12 oz. Click the
                active sort again to reverse it. Cards start closed; tap one to see its address and items.
              </Text>
              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
              <BoxView
                styles={styles}
                colors={colors}
                packages={listed}
                groupBy={groupBy}
                sortBy={sortBy}
                sortDir={sortDir}
                focusPackageId={focusPackageId}
                onToggle={toggleLine}
                onSize={chooseSize}
              />
            </>
          ) : (
            <>
              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
              <ProductView
                styles={styles}
                packages={listed}
                categories={categories}
                onCategories={setCategories}
                onToggle={toggleLine}
                onOpenPackage={openPackage}
                hideDone={hideDone}
              />
            </>
          )}
        </ScrollView>
      </WebContentPanel>
    </View>
  );
}

function Stat({ styles, label, value }: { styles: Styles; label: string; value: number | string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Chip({
  styles,
  label,
  active,
  onPress,
}: {
  styles: Styles;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ChipRow({ styles, children }: { styles: Styles; children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function PackCheck({ styles, checked, onPress }: { styles: Styles; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={[styles.check, checked && styles.checkOn]}
    >
      {checked ? <Text style={styles.checkMark}>✓</Text> : null}
    </TouchableOpacity>
  );
}

type BoxViewProps = {
  styles: Styles;
  colors: SemanticColors;
  packages: PackingPackage[];
  groupBy: GroupBy;
  sortBy: SortBy;
  sortDir: SortDir;
  focusPackageId: string | null;
  onToggle: (pkg: PackingPackage, line: PackingLine) => void;
  onSize: (pkg: PackingPackage, size: PackingSize) => void;
};

function sortPackages(list: PackingPackage[], sortBy: SortBy, sortDir: SortDir): PackingPackage[] {
  const sign = sortDir === 'asc' ? 1 : -1;
  const byName = (a: PackingPackage, b: PackingPackage) => (a.recipient ?? '').localeCompare(b.recipient ?? '');
  const copy = [...list];
  copy.sort((a, b) => {
    let diff = 0;
    if (sortBy === 'size') diff = SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size);
    else if (sortBy === 'recipient') diff = byName(a, b);
    else if (sortBy === 'weight') diff = packageWeight(a).oz - packageWeight(b).oz;
    else diff = unpackedLines(a) - unpackedLines(b);
    return diff === 0 ? byName(a, b) : diff * sign;
  });
  return copy;
}

function BoxView({ styles, colors, packages, groupBy, sortBy, sortDir, focusPackageId, onToggle, onSize }: BoxViewProps) {
  if (packages.length === 0) {
    return (
      <Text style={styles.caption}>
        Nothing to pack here yet. Box orders appear after the box lock charges them; shop orders and gifts appear as soon as
        they are paid.
      </Text>
    );
  }
  const sorted = sortPackages(packages, sortBy, sortDir);
  const sizeGroups = sortBy === 'size' && sortDir === 'desc' ? [...SIZE_ORDER].reverse() : SIZE_ORDER;
  if (groupBy === 'none') {
    return (
      <>
        {sorted.map((p) => (
          <PackageCard
            key={p.id}
            styles={styles}
            colors={colors}
            pkg={p}
            forceOpen={focusPackageId === p.id}
            onToggle={onToggle}
            onSize={onSize}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {sizeGroups.map((size) => {
        const group = sorted.filter((p) => p.size === size);
        if (group.length === 0) return null;
        return (
          <View key={size} style={styles.group}>
            <Text style={styles.groupTitle}>
              {PACKING_SIZE_LABEL[size]} · {group.length} {group.length === 1 ? 'package' : 'packages'}
            </Text>
            {group.map((p) => (
              <PackageCard
                key={p.id}
                styles={styles}
                colors={colors}
                pkg={p}
                forceOpen={focusPackageId === p.id}
                onToggle={onToggle}
                onSize={onSize}
              />
            ))}
          </View>
        );
      })}
    </>
  );
}

function PackageCard({
  styles,
  colors,
  pkg,
  forceOpen,
  onToggle,
  onSize,
}: {
  styles: Styles;
  colors: SemanticColors;
  pkg: PackingPackage;
  forceOpen: boolean;
  onToggle: (pkg: PackingPackage, line: PackingLine) => void;
  onSize: (pkg: PackingPackage, size: PackingSize) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const done = pkg.lines.filter((l) => l.packed).length;
  const addr = pkg.destination;
  const kidsLine = pkg.kids.length
    ? pkg.kids.map((k) => `${k.name ?? 'Child'}${k.age ? `, ${k.age}` : ''}`).join(' · ')
    : null;
  const sliders = `Hanukkah ${pkg.sliders.hanukkah ?? '—'} · Jewish ${pkg.sliders.jewish ?? '—'}`;
  const sizeWarnings: string[] = [];
  if (pkg.kind !== 'shop' && pkg.size === '10x8x6') sizeWarnings.push('10 × 8 × 6 is for shop orders.');

  const weight = packageWeight(pkg);
  return (
    <View nativeID={`packing-${pkg.id}`} style={[styles.card, isDone(pkg) && styles.cardDone]}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Close' : 'Open'} ${pkg.recipient ?? pkg.reference}`}
      >
        <View style={styles.cardHead}>
          <View style={styles.badgeRow}>
            <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
            <Text style={[styles.badge, pkg.kind === 'gift' && styles.badgeGift, pkg.kind === 'shop' && styles.badgeShop]}>
              {KIND_LABEL[pkg.kind]}
            </Text>
            {pkg.test ? <Text style={styles.badgeTest}>Test</Text> : null}
            {pkg.awaitingPayment ? <Text style={styles.badgeLarge}>Not charged yet</Text> : null}
            {pkg.mayNeedLargeBox ? <Text style={styles.badgeLarge}>May need a large box</Text> : null}
            <Text style={styles.reference}>{pkg.reference}</Text>
          </View>
          <Text style={styles.progress}>
            {done} / {pkg.lines.length} packed
          </Text>
        </View>
        <Text style={styles.recipient}>{pkg.recipient ?? pkg.email ?? 'No name on file'}</Text>
        <Text style={styles.meta}>
          {pkg.awaitingPayment ? `Committed ${when(pkg.paidAt)} · not charged` : `Paid ${when(pkg.paidAt)} · ${pkg.status}`}
          {weight.oz > 0 ? ` · ${weight.estimated ? '~' : ''}${formatOz(weight.oz)}` : ''}
        </Text>
      </TouchableOpacity>
      {open ? (
      <>
      <View style={styles.infoGrid}>
        <View style={styles.infoCol}>
          <Text style={styles.infoHead}>Ship to</Text>
          {addr ? (
            <>
              {addr.name ? <Text style={styles.infoText}>{addr.name}</Text> : null}
              <Text style={styles.infoText}>{addr.line1}</Text>
              {addr.line2 ? <Text style={styles.infoText}>{addr.line2}</Text> : null}
              <Text style={styles.infoText}>
                {[addr.city, [addr.stateProvince, addr.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                {addr.country && addr.country !== 'US' ? ` · ${addr.country}` : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.infoText}>No address on file</Text>
          )}
        </View>
        <View style={styles.infoCol}>
          {pkg.kind === 'box' ? (
            <>
              <Text style={styles.infoHead}>Kids</Text>
              <Text style={styles.infoText}>{kidsLine ?? 'No children on file'}</Text>
              <Text style={styles.infoHead}>Sliders</Text>
              <Text style={styles.infoText}>{sliders}</Text>
            </>
          ) : null}
          {pkg.note ? (
            <>
              <Text style={styles.infoHead}>{pkg.kind === 'gift' ? 'Gift message' : 'Note'}</Text>
              <Text style={styles.infoText}>{pkg.note}</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.sizeRow}>
        <Text style={styles.infoHead}>Box</Text>
        <View style={styles.chipRow}>
          {SIZE_OPTIONS.map((s) => {
            const active = pkg.size === s;
            const recommended = pkg.recommendedSize === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => onSize(pkg, s)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {PACKING_SIZE_LABEL[s]}
                  {recommended ? ' · rec.' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {sizeWarnings.map((w) => (
        <Text key={w} style={styles.warn}>
          {w}
        </Text>
      ))}

      <View style={styles.lines}>
        {pkg.lines.map((l) => (
          <LineRow key={l.key} styles={styles} line={l} onPress={() => onToggle(pkg, l)} />
        ))}
      </View>
      </>
      ) : null}
    </View>
  );
}

function LineRow({ styles, line, onPress }: { styles: Styles; line: PackingLine; onPress: () => void }) {
  return (
    <View style={[styles.line, line.packed && styles.lineDone]}>
      <PackCheck styles={styles} checked={line.packed} onPress={onPress} />
      <View style={styles.lineBody}>
        <Text style={[styles.lineName, line.packed && styles.lineNameDone]}>
          {line.qty} × {line.name}
        </Text>
        <View style={styles.tagRow}>
          {line.wrap ? <Text style={styles.tagWrap}>Pre-wrap</Text> : null}
          {line.origin ? <Text style={styles.tag}>{ORIGIN_LABEL[line.origin]}</Text> : null}
          {line.child ? <Text style={styles.tag}>For {line.child}</Text> : null}
          {line.forHousehold && line.origin == null ? <Text style={styles.tag}>Household</Text> : null}
          {line.maxInches != null && line.maxInches > 12 ? <Text style={styles.tagWarn}>Over 12 in</Text> : null}
          {line.dimensions ? <Text style={styles.dims}>{line.dimensions}</Text> : null}
        </View>
      </View>
    </View>
  );
}

type ProductViewProps = {
  styles: Styles;
  packages: PackingPackage[];
  categories: string[];
  onCategories: (next: string[]) => void;
  hideDone: boolean;
  onToggle: (pkg: PackingPackage, line: PackingLine) => void;
  onOpenPackage: (packageId: string) => void;
};

function categoryRank(name: string): number {
  const i = CATEGORY_ORDER.indexOf(name);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function ProductView({ styles, packages, categories, onCategories, hideDone, onToggle, onOpenPackage }: ProductViewProps) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const toggleOpen = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const rows = useMemo(() => {
    const byItem = new Map<
      string,
      { key: string; name: string; category: string; total: number; entries: Array<{ pkg: PackingPackage; line: PackingLine }> }
    >();
    for (const pkg of packages) {
      for (const line of pkg.lines) {
        if (categories.length > 0 && !categories.includes(line.category ?? 'Other')) continue;
        const key = line.itemId ?? line.name;
        const row = byItem.get(key) ?? { key, name: line.name, category: line.category ?? 'Other', total: 0, entries: [] };
        row.total += line.qty;
        row.entries.push({ pkg, line });
        byItem.set(key, row);
      }
    }
    return [...byItem.values()]
      .map((r) => ({
        ...r,
        entries: r.entries
          .filter((e) => !hideDone || !e.line.packed)
          .sort((a, b) => SIZE_ORDER.indexOf(a.pkg.size) - SIZE_ORDER.indexOf(b.pkg.size) || (a.pkg.recipient ?? '').localeCompare(b.pkg.recipient ?? '')),
      }))
      .filter((r) => r.entries.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [packages, hideDone, categories]);

  const available = useMemo(() => {
    const names = new Set<string>();
    for (const pkg of packages) for (const line of pkg.lines) names.add(line.category ?? 'Other');
    return [...names].sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  }, [packages]);

  const toggleCategory = (name: string) => {
    onCategories(categories.includes(name) ? categories.filter((c) => c !== name) : [...categories, name]);
  };

  return (
    <>
      <Text style={styles.section}>Category</Text>
      <ChipRow styles={styles}>
        <Chip styles={styles} label="All" active={categories.length === 0} onPress={() => onCategories([])} />
        {available.map((name) => (
          <Chip
            key={name}
            styles={styles}
            label={name}
            active={categories.includes(name)}
            onPress={() => toggleCategory(name)}
          />
        ))}
      </ChipRow>
      <Text style={styles.caption}>
        Grouped by product. Pick a category to narrow the list; pick more than one to combine them. Cards start closed; tap
        a product to see which packages need it. The order number opens that box.
      </Text>
      {rows.length === 0 ? <Text style={styles.caption}>No items to pack here yet.</Text> : null}
      {rows.map((row) => {
        const packed = row.entries.filter((e) => e.line.packed).length;
        const units = row.entries.reduce((s, e) => s + e.line.qty, 0);
        const open = openKeys.has(row.key);
        return (
          <View key={row.key} style={styles.card}>
            <TouchableOpacity
              onPress={() => toggleOpen(row.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${open ? 'Close' : 'Open'} ${row.name}`}
            >
              <View style={styles.cardHead}>
                <View style={styles.badgeRow}>
                  <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
                  <Text style={styles.recipient}>{row.name}</Text>
                  <Text style={styles.tag}>{row.category}</Text>
                </View>
                <Text style={styles.progress}>
                  {units} units · {packed} / {row.entries.length} packed
                </Text>
              </View>
            </TouchableOpacity>
            {open ? <View style={styles.lines}>
              {row.entries.map(({ pkg, line }) => (
                <View key={`${pkg.id}:${line.key}`} style={[styles.line, line.packed && styles.lineDone]}>
                  <PackCheck styles={styles} checked={line.packed} onPress={() => onToggle(pkg, line)} />
                  <View style={styles.lineBody}>
                    <Text style={[styles.lineName, line.packed && styles.lineNameDone]}>
                      {line.qty} → {pkg.recipient ?? pkg.email ?? pkg.reference}
                    </Text>
                    <View style={styles.tagRow}>
                      <TouchableOpacity
                        onPress={() => onOpenPackage(pkg.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${pkg.reference}`}
                      >
                        <Text style={styles.tag}>{pkg.reference}</Text>
                      </TouchableOpacity>
                      <Text style={styles.tag}>{KIND_LABEL[pkg.kind]}</Text>
                      {pkg.awaitingPayment ? <Text style={styles.tagWrap}>Not charged</Text> : null}
                      <Text style={styles.tag}>{PACKING_SIZE_LABEL[pkg.size]}</Text>
                      {line.wrap ? <Text style={styles.tagWrap}>Pre-wrap</Text> : null}
                      {line.origin ? <Text style={styles.tag}>{ORIGIN_LABEL[line.origin]}</Text> : null}
                      {line.child ? <Text style={styles.tag}>For {line.child}</Text> : null}
                    </View>
                  </View>
                </View>
              ))}
            </View> : null}
          </View>
        );
      })}
    </>
  );
}

function createStyles(colors: SemanticColors, isDesktop: boolean) {
  return StyleSheet.create({
    host: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    panel: { flex: 1, width: '100%', minHeight: 0, backgroundColor: colors.bgPrimary },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 120,
      maxWidth: isDesktop ? 1120 : undefined,
      width: '100%',
      alignSelf: isDesktop ? 'center' : undefined,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
    backLink: {
      ...typeface('regular'),
      fontSize: typography.md,
      color: colors.textSecondary,
      letterSpacing: -0.22,
    },
    title: {
      ...typeface('medium'),
      fontSize: 32,
      letterSpacing: -0.6,
      color: colors.textPrimary,
    },
    caption: {
      ...typeface('light'),
      fontSize: typography.sm,
      lineHeight: 18,
      color: colors.goldMuted,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    hint: { ...typeface('light'), fontSize: typography.md, color: colors.textPrimary },
    error: { ...typeface('regular'), fontSize: typography.sm, color: colors.error, marginVertical: spacing.xs },
    section: {
      ...typeface('medium'),
      fontSize: 15,
      color: colors.logoDark,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    stat: {
      minWidth: 120,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgDark,
    },
    statValue: { ...typeface('medium'), fontSize: 22, color: colors.textPrimary },
    statLabel: { ...typeface('light'), fontSize: typography.xs, color: colors.goldMuted, marginTop: 2 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgDark,
    },
    chipActive: { borderColor: colors.brand, backgroundColor: colors.brand },
    chipLabel: { ...typeface('regular'), fontSize: typography.sm, color: colors.textPrimary },
    chipLabelActive: { color: colors.textInverse },
    group: { marginTop: spacing.md },
    groupTitle: {
      ...typeface('medium'),
      fontSize: 17,
      color: colors.logoDark,
      marginBottom: spacing.sm,
    },
    card: {
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgDark,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardDone: { opacity: 0.6 },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    chevron: { ...typeface('medium'), fontSize: typography.sm, color: colors.goldMuted, width: 14 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    badge: {
      ...typeface('medium'),
      fontSize: typography.xs,
      color: colors.bgPrimary,
      backgroundColor: colors.info,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      overflow: 'hidden',
    },
    badgeGift: { backgroundColor: colors.goldDark },
    badgeShop: { backgroundColor: colors.success },
    badgeTest: {
      ...typeface('medium'),
      fontSize: typography.xs,
      color: colors.warning,
    },
    badgeLarge: {
      ...typeface('medium'),
      fontSize: typography.xs,
      color: colors.warning,
    },
    reference: { ...typeface('light'), fontSize: typography.xs, color: colors.goldMuted },
    progress: { ...typeface('medium'), fontSize: typography.sm, color: colors.textPrimary },
    recipient: { ...typeface('medium'), fontSize: 18, color: colors.textPrimary, marginTop: spacing.xs },
    meta: { ...typeface('light'), fontSize: typography.xs, color: colors.goldMuted, marginTop: 2 },
    infoGrid: { flexDirection: isDesktop ? 'row' : 'column', gap: spacing.md, marginTop: spacing.sm },
    infoCol: { flex: 1, gap: 2 },
    infoHead: {
      ...typeface('medium'),
      fontSize: typography.xs,
      color: colors.goldMuted,
      marginTop: spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    infoText: { ...typeface('regular'), fontSize: typography.sm, color: colors.textPrimary, lineHeight: 18 },
    sizeRow: { marginTop: spacing.sm, gap: spacing.xs },
    warn: { ...typeface('medium'), fontSize: typography.sm, color: colors.warning, marginTop: spacing.xs },
    lines: { marginTop: spacing.sm, gap: spacing.xs },
    line: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    lineDone: { opacity: 0.55 },
    lineBody: { flex: 1, gap: 4 },
    lineName: { ...typeface('medium'), fontSize: typography.md, color: colors.textPrimary },
    lineNameDone: { textDecorationLine: 'line-through' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    tag: {
      ...typeface('regular'),
      fontSize: typography.xs,
      color: colors.textSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    tagWrap: {
      ...typeface('medium'),
      fontSize: typography.xs,
      color: colors.bgPrimary,
      backgroundColor: colors.goldDark,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    tagWarn: {
      ...typeface('medium'),
      fontSize: typography.xs,
      color: colors.warning,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    dims: { ...typeface('light'), fontSize: typography.xs, color: colors.goldMuted },
    check: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.textSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkOn: { backgroundColor: colors.success, borderColor: colors.success },
    checkMark: { color: colors.bgPrimary, fontSize: 14, fontWeight: '700' },
  });
}
