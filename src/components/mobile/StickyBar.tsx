import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MobileButton } from './MobileButton';
import { m, mFont } from './mobileTheme';

type Props = {
  /** Small line above the total: "Box $80 + $15", "Charged when it ships". */
  label?: string;
  /** The big number or phrase: "Total $95", "$84.80". */
  total?: string;
  /** Tapping the label/total area (opens the receipt). */
  onSummaryPress?: () => void;
  cta: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'secondary' };
  /** Side by side (box editor) or stacked (checkout, gifts). */
  layout?: 'row' | 'stack';
  /** Shown above the bar, e.g. "Move both sliders to continue". */
  hint?: string;
  testID?: string;
};

/** Always white: the total, then the black button. Labels say where they go. */
export function StickyBar({ label, total, onSummaryPress, cta, layout = 'row', hint, testID }: Props) {
  const insets = useSafeAreaInsets();
  const summary = (
    <Pressable onPress={onSummaryPress} disabled={!onSummaryPress} style={styles.summary} accessibilityRole={onSummaryPress ? 'button' : undefined}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {total ? (
        <Text style={styles.total}>
          {total}
          {onSummaryPress ? <Text style={styles.chev}> ⌃</Text> : null}
        </Text>
      ) : null}
    </Pressable>
  );
  return (
    <View style={[styles.root, { paddingBottom: 10 + insets.bottom }]} testID={testID}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {layout === 'row' ? (
        <View style={styles.row}>
          {summary}
          <View style={styles.rowCta}>
            <MobileButton label={cta.label} onPress={cta.onPress} disabled={cta.disabled} busy={cta.busy} variant={cta.variant} height={48} />
          </View>
        </View>
      ) : (
        <>
          {label || total ? (
            <View style={styles.stackTop}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.stackTotal}>{total}</Text>
            </View>
          ) : null}
          <MobileButton label={cta.label} onPress={cta.onPress} disabled={cta.disabled} busy={cta.busy} variant={cta.variant} height={54} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: Platform.OS === 'web' ? ('fixed' as unknown as 'absolute') : 'absolute',
    left: 0, right: 0, bottom: 0, zIndex: 40,
    backgroundColor: m.white, borderTopWidth: 1, borderTopColor: m.line,
    paddingHorizontal: 16, paddingTop: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCta: { minWidth: 150 },
  summary: { flex: 1 },
  label: { fontSize: 12.5, color: m.muted, ...mFont(300), lineHeight: 16 },
  total: { fontSize: 17, color: m.ink, ...mFont(500), lineHeight: 22 },
  chev: { fontSize: 11, color: m.goldDark },
  stackTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  stackTotal: { fontSize: 17, color: m.ink, ...mFont(500) },
  hint: { fontSize: 12.5, color: m.muted, textAlign: 'center', marginBottom: 8, ...mFont(400) },
});

/** Space to leave under scroll content so the bar never covers the last row. */
export const STICKY_BAR_CLEARANCE = 96;
