import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BoxSummary, type BoxThumb } from './BoxSummary';
import { m, mFont } from './mobileTheme';

export type OrderLine = { label: string; value: string };

type Props = {
  title?: string;
  sub?: string | React.ReactNode;
  items: BoxThumb[];
  lines: OrderLine[];
  totalLabel: string;
  total: string;
  /** Rendered between the thumbnails and the lines (the expanded receipt). */
  children?: React.ReactNode;
};

/** Every payment step shows the same summary: the small box summary, then the price lines. "Covered" values read in dark gold. */
export function OrderSummary({ title = 'Your Hanukkah box', sub, items, lines, totalLabel, total, children }: Props) {
  return (
    <BoxSummary size="sm" title={title} sub={sub} items={items}>
      {children}
      <View style={styles.lines}>
        {lines.map((l) => (
          <View key={l.label} style={styles.line}>
            <Text style={styles.label}>{l.label}</Text>
            <Text style={[styles.value, l.value === 'Covered' && styles.covered]}>{l.value}</Text>
          </View>
        ))}
        <View style={[styles.line, styles.total]}>
          <Text style={styles.totalLabel}>{totalLabel}</Text>
          <Text style={styles.totalValue}>{total}</Text>
        </View>
      </View>
    </BoxSummary>
  );
}

const styles = StyleSheet.create({
  lines: { gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: m.lineWarm },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 14, color: m.body, ...mFont(400), flex: 1 },
  value: { fontSize: 14, color: m.ink, ...mFont(400) },
  covered: { color: m.goldDark },
  total: { paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: m.lineWarm },
  totalLabel: { fontSize: 16, color: m.ink, ...mFont(500), flex: 1 },
  totalValue: { fontSize: 16, color: m.ink, ...mFont(500) },
});
