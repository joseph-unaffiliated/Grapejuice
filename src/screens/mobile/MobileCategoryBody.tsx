import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { availabilityRemaining } from '../../services/catalog/availability';
import { ProductTileMobile, type TileStatus } from '../../components/mobile/ProductTileMobile';
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
  onViewBox: () => void;
  loading?: boolean;
  empty?: React.ReactNode;
};

/** Category page for the phone layouts: title, count, scrolling chips, two-column tiles with box status. */
export function MobileCategoryBody(p: Props) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - mGutter * 2 - 12) / 2);
  const stuffies = p.slug === 'stuffies';
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={mType.h1}>{p.title}</Text>
        {p.sub ? <Text style={[mType.body, { marginTop: 4 }]}>{p.sub}</Text> : null}
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
      {stuffies && p.hasBox ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>Any stuffie can be {p.kidName ?? 'your kid'}'s present. Swapping one in is included.</Text>
        </View>
      ) : null}
      <View style={styles.bar}>
        <Text style={mType.small}>{p.items.length} {p.items.length === 1 ? 'item' : 'items'}</Text>
        <Pressable onPress={p.onCycleSort} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sort}>Sort: {p.sortLabel}</Text>
        </Pressable>
      </View>
      {p.loading ? null : p.items.length === 0 ? (
        p.empty
      ) : (
        <View style={styles.grid}>
          {p.items.map((it) => {
            const avail = p.availabilityById[it.id];
            const inBox = p.boxState.get(it.id);
            let status: TileStatus = null;
            if (inBox) status = inBox.paid ? { kind: 'added', text: `Added${inBox.kid ? ` for ${inBox.kid}` : ''}` } : { kind: 'inbox' };
            else if (avail?.status === 'sold_out') status = { kind: 'sold' };
            else {
              const left = avail ? availabilityRemaining(avail) : null;
              if (left != null && left > 0 && left <= 12) status = { kind: 'low', text: `Low stock · ${left} left` };
            }
            return (
              <ProductTileMobile
                key={it.id}
                item={it}
                width={tile}
                status={status}
                onPress={() => p.onOpen(it.id)}
                action={
                  p.hasBox && !inBox && status?.kind !== 'sold'
                    ? { label: 'Add to my box', onPress: () => p.onOpen(it.id), variant: 'secondary' }
                    : inBox
                      ? { label: 'View my box', onPress: p.onViewBox, variant: 'secondary' }
                      : undefined
                }
                style={{ marginBottom: 20 }}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 8 },
  head: { paddingHorizontal: mGutter, paddingTop: 18, paddingBottom: 12 },
  chips: { paddingHorizontal: mGutter, gap: 8, paddingBottom: 12 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipText: { fontSize: 14, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
  note: { marginHorizontal: mGutter, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: m.beige },
  noteText: { fontSize: 13.5, color: m.goldDark, lineHeight: 19, ...mFont(400) },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: mGutter, paddingBottom: 12 },
  sort: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: mGutter },
});
