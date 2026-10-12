import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { ProductTileMobile, stockStatus, type TileStatus } from '../../components/mobile/ProductTileMobile';
import { m, mFont, mGutter, mType } from '../../components/mobile/mobileTheme';

type Props = {
  slug: string;
  title: string;
  sub?: string;
  items: CatalogItem[];
  availabilityById: Record<string, CatalogAvailability>;
  /** Item ids in the visitor's box (by id) with their paid add-on state. */
  boxState: Map<string, { paid: boolean; kid?: string | null }>;
  hasBox: boolean;
  kidName?: string | null;
  sortLabel: string;
  onCycleSort: () => void;
  onCategory: (slug: string) => void;
  onOpen: (slug: string) => void;
  /** "Add to my box" on a tile — product page with the add choice already open. */
  onAdd: (slug: string) => void;
  onViewBox: () => void;
  loading?: boolean;
  empty?: React.ReactNode;
  /** Collection page: two picks per aisle under a See all heading (store.html s=2). */
  sections?: { slug: string; title: string; items: CatalogItem[] }[];
};

/** Category page for the phone layouts: title, count, scrolling chips, two-column tiles with box status. */
export function MobileCategoryBody(p: Props) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - mGutter * 2 - 12) / 2);
  const stuffies = p.slug === 'stuffies';
  const head = (
    <>
      <View style={styles.head}>
        <Text style={[mType.h1, { fontSize: 30, lineHeight: 34 }]}>{p.title}</Text>
        {p.sub ? <Text style={styles.sub}>{p.sub}</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STOREFRONT_CATEGORIES.map((c) => {
          const on = c.slug === p.slug;
          return (
            <Pressable key={c.slug} onPress={() => p.onCategory(c.slug)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
  const renderTile = (it: CatalogItem) => {
    const avail = p.availabilityById[it.id];
    const inBox = p.boxState.get(it.id);
    let status: TileStatus = null;
    if (inBox) status = inBox.paid ? { kind: 'added', text: `Added${inBox.kid ? ` for ${inBox.kid}` : ''}` } : { kind: 'inbox' };
    else status = stockStatus(avail);
    return (
      <ProductTileMobile
        key={it.id}
        item={it}
        width={tile}
        status={status}
        onPress={() => p.onOpen(it.id)}
        action={
          p.hasBox && !inBox && status?.kind !== 'sold'
            ? { label: 'Add to my box', onPress: () => p.onAdd(it.id), variant: 'secondary' }
            : inBox
              ? { label: 'View my box', onPress: p.onViewBox, variant: 'secondary' }
              : undefined
        }
        style={{ marginBottom: 8 }}
      />
    );
  };
  if (p.sections) {
    return (
      <View style={styles.root}>
        {head}
        {p.loading ? null : (
          <View style={{ paddingTop: 24 }}>
            {p.sections.map((sec) => (
              <View key={sec.slug} style={styles.section}>
                <View style={styles.secHead}>
                  <Text style={styles.secTitle}>{sec.title}</Text>
                  <Pressable onPress={() => p.onCategory(sec.slug)} accessibilityRole="button" accessibilityLabel={`See all ${sec.title}`} hitSlop={8}>
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                </View>
                <View style={styles.grid}>{inBoxFirst(sec.items, p.boxState).slice(0, 2).map(renderTile)}</View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={styles.root}>
      {head}
      {stuffies && p.hasBox ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>Any stuffie can be {p.kidName ?? 'your kid'}'s present. Swapping one in is included.</Text>
        </View>
      ) : null}
      <View style={styles.bar}>
        <Text style={styles.count}>{p.items.length} {p.items.length === 1 ? 'item' : 'items'}</Text>
        <Pressable onPress={p.onCycleSort} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sort}>Sort: {p.sortLabel}</Text>
        </Pressable>
      </View>
      {p.loading ? null : p.items.length === 0 ? (
        p.empty
      ) : (
        <View style={styles.grid}>{inBoxFirst(p.items, p.boxState).map(renderTile)}</View>
      )}
    </View>
  );
}

/** What's already in the box leads the grid, as in the store. */
function inBoxFirst(items: CatalogItem[], boxState: Props['boxState']): CatalogItem[] {
  return [...items.filter((it) => boxState.has(it.id)), ...items.filter((it) => !boxState.has(it.id))];
}

const styles = StyleSheet.create({
  root: { paddingBottom: 40 },
  head: { paddingHorizontal: mGutter, paddingTop: 22, paddingBottom: 4, gap: 6 },
  sub: { fontSize: 14, lineHeight: 20, color: m.muted, ...mFont(300) },
  chips: { paddingHorizontal: mGutter, gap: 8, paddingTop: 14, paddingBottom: 10 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipText: { fontSize: 13, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
  note: { marginHorizontal: mGutter, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: m.beige },
  noteText: { fontSize: 13.5, color: m.goldDark, lineHeight: 19, ...mFont(400) },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: mGutter, paddingTop: 14, paddingBottom: 16 },
  count: { fontSize: 13, color: m.muted, ...mFont(400) },
  sort: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  section: { paddingBottom: 28 },
  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: mGutter, paddingBottom: 14 },
  secTitle: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.ink, ...mFont(400) },
  seeAll: { fontSize: 13.5, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 12, paddingHorizontal: mGutter },
});
