import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BoxItemImage } from '../../components/box/BoxItemImage';
import { TaskHeader } from '../../components/mobile/TaskHeader';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { BoxPitch } from '../../components/mobile/BoxPitch';
import { MobileButton } from '../../components/mobile/MobileButton';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import type { BoxLineItem, CatalogItem } from '../../types/pilot';
import { m, mFont, mGutter, mType } from '../../components/mobile/mobileTheme';

type Props = {
  lines: BoxLineItem[];
  catalogById: Map<string, CatalogItem>;
  issues: Record<string, string | undefined>;
  subtotalCents: number;
  onBack: () => void;
  onOpen: (li: BoxLineItem) => void;
  onQuantity: (li: BoxLineItem, delta: 1 | -1) => void;
  onCheckout: () => void;
  onStartBox: () => void;
  onShop: () => void;
  hasBox: boolean;
};

/** The phone cart: task header, rows with steppers, totals, the box pitch, a white Checkout bar. */
export function MobileCartBody(p: Props) {
  const pitchItems = p.lines.map((li) => p.catalogById.get(li.itemId)).filter((x): x is CatalogItem => !!x).slice(0, 3);
  if (p.lines.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <TaskHeader back={{ label: 'Shop', onPress: p.onBack }} title="Cart" />
        <View style={styles.empty}>
          <Text style={mType.h2}>Your cart is empty</Text>
          <Text style={[mType.body, { marginTop: 6, textAlign: 'center' }]}>The Hanukkah box has what you need, or shop the collection piece by piece.</Text>
          <MobileButton label="Build my box" onPress={p.onStartBox} style={{ marginTop: 18 }} />
          <MobileButton label="Shop the collection" onPress={p.onShop} variant="secondary" style={{ marginTop: 10 }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ paddingBottom: STICKY_BAR_CLEARANCE + 20 }}>
      <TaskHeader back={{ label: 'Shop', onPress: p.onBack }} title="Cart" />
      <View style={styles.pad}>
        {p.lines.map((li) => {
          const item = p.catalogById.get(li.itemId);
          const qty = Math.max(1, li.quantity || 1);
          const issue = p.issues[li.itemId];
          return (
            <View key={li.slotId + li.itemId} style={styles.row}>
              <Pressable onPress={() => p.onOpen(li)} accessibilityRole="button">
                <BoxItemImage size={72} imageUrl={item?.imageUrl} itemId={li.itemId} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Pressable onPress={() => p.onOpen(li)} accessibilityRole="button">
                  <Text style={styles.name}>{li.label || item?.name || li.itemId}</Text>
                </Pressable>
                <Text style={styles.price}>{formatCatalogDollars(li.unitCents * qty)}</Text>
                {issue ? <Text style={styles.issue}>{issue}</Text> : null}
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => p.onQuantity(li, -1)} accessibilityRole="button" accessibilityLabel={qty <= 1 ? 'Remove' : 'Decrease quantity'} style={styles.stepBtn}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.stepQty}>{qty}</Text>
                <Pressable onPress={() => p.onQuantity(li, 1)} accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.stepBtn}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        <View style={styles.totals}>
          <Line label="Subtotal" value={formatCatalogDollars(p.subtotalCents)} />
          <Line label="Shipping" value="Free" />
          <Line label="Tax" value="At checkout" />
        </View>
      </View>
      {!p.hasBox && pitchItems.length ? (
        <View style={{ marginTop: 8 }}>
          <BoxPitch items={pitchItems} title={pitchItems.length > 1 ? 'Getting these for Hanukkah? Put them in a box' : 'Getting this for Hanukkah? Put it in a box'} cta={pitchItems.length > 1 ? 'Start a box with these' : 'Start a box with it'} onPress={p.onStartBox} />
        </View>
      ) : null}
      <StickyBar label="Subtotal · charged today" total={formatCatalogDollars(p.subtotalCents)} layout="stack" cta={{ label: 'Checkout', onPress: p.onCheckout, disabled: Object.keys(p.issues).length > 0 }} />
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: mGutter },
  empty: { padding: mGutter, paddingTop: 48, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  name: { fontSize: 15, color: m.ink, ...mFont(400) },
  price: { fontSize: 13.5, color: m.muted, marginTop: 2, ...mFont(400) },
  issue: { fontSize: 12.5, color: m.warn, marginTop: 2, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 18, height: 36 },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark },
  stepQty: { minWidth: 18, textAlign: 'center', fontSize: 14, color: m.ink, ...mFont(500) },
  totals: { paddingVertical: 16, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 14.5, color: m.body, ...mFont(400) },
  lineValue: { fontSize: 14.5, color: m.ink, ...mFont(400) },
});
