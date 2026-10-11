import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCatalog } from '../../hooks/useCatalog';
import { useBoxGlance } from '../../hooks/useBoxGlance';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { boxAddOnUnitCents, inferPricingTier } from '../../services/box/pricing';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import type { CatalogItem } from '../../types/pilot';
import { BoxSummary, type BoxThumb } from './BoxSummary';
import { MobileButton } from './MobileButton';
import { primaryPhoto, SAMPLE_BOX_IDS } from './catalogPhotos';
import { m, mFont, mGutter } from './mobileTheme';

type Props = {
  /** The item(s) the visitor is looking at; shown outlined inside the box. */
  items: CatalogItem[];
  title?: string;
  cta?: string;
  onPress: () => void;
};

/**
 * For visitors without a box: the large box summary with their item outlined, the price
 * lines, and "Start a box with it". Included-tier items cost nothing extra in a box.
 */
export function BoxPitch({ items, title, cta = 'Start a box with it', onPress }: Props) {
  const { items: catalog } = useCatalog();
  const { lockShort } = useBoxGlance();
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const base = listBoxCentsForKids(1);
  const add = items.reduce((t, it) => t + (inferPricingTier(it) === 'included' ? 0 : boxAddOnUnitCents(it)), 0);
  const ids = new Set(items.map((i) => i.id));
  const rest = SAMPLE_BOX_IDS.filter((id) => !ids.has(id)).slice(0, Math.max(0, 6 - items.length));
  const thumbs: BoxThumb[] = [
    ...items.map((it) => ({ id: it.id, imageUrl: primaryPhoto(it), mine: true })),
    ...rest.map((id) => ({ id, imageUrl: primaryPhoto(byId.get(id)) })),
  ];
  const label = items.length === 1 ? items[0]!.name : `These ${items.length} items`;
  return (
    <View style={styles.wrap}>
      <BoxSummary title={title ?? `Everything for eight nights, with ${items.length === 1 ? 'this' : 'these'} in it`} sub="Get it in the Hanukkah box" items={thumbs}>
        <View style={styles.lines}>
          <View style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Hanukkah box</Text>
              <Text style={styles.small}>Candles, dreidels, gelt, food kits, a book and a present for each kid</Text>
            </View>
            <Text style={styles.value}>{formatCatalogDollars(base)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
            <Text style={styles.value}>{add > 0 ? `+${formatCatalogDollars(add)}` : 'Included'}</Text>
          </View>
          <View style={[styles.line, styles.total]}>
            <Text style={[styles.totalLabel, { flex: 1 }]}>Total</Text>
            <Text style={styles.totalValue}>{formatCatalogDollars(base + add)}</Text>
          </View>
        </View>
        <MobileButton label={cta} onPress={onPress} height={50} />
        <Text style={styles.note}>Free shipping · change anything until {lockShort} · charged when it ships</Text>
      </BoxSummary>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: mGutter },
  lines: { paddingTop: 4 },
  line: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: m.lineWarm },
  label: { fontSize: 14.5, color: m.ink, ...mFont(400) },
  small: { fontSize: 12.5, color: m.muted, lineHeight: 17, marginTop: 2, ...mFont(300) },
  value: { fontSize: 14.5, color: m.ink, ...mFont(500) },
  total: { borderBottomWidth: 0 },
  totalLabel: { fontSize: 16, color: m.ink, ...mFont(400) },
  totalValue: { fontSize: 17, color: m.ink, ...mFont(500) },
  note: { fontSize: 12.5, color: m.muted, textAlign: 'center', ...mFont(400) },
});
