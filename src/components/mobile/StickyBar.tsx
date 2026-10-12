import React, { useContext, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MobileButton } from './MobileButton';
import { useCookieButtonClearance } from '../../hooks/useCookieButtonClearance';
import { m, mFont } from './mobileTheme';

type Props = {
  /** Small line above the total: "Box $80 + $15", "Charged after Nov 7". */
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
  /** Row layout: the button fills the rest of the bar (product pages) or hugs its label (My Box). */
  ctaFill?: boolean;
};

/** Always white: the total, then the black button. Labels say where they go. */
export function StickyBar({ label, total, onSummaryPress, cta, layout = 'row', hint, testID, ctaFill = true }: Props) {
  const insets = useSafeAreaInsets();
  const focused = useScreenFocused();
  const onLayout = useCookieButtonClearance(Platform.OS === 'web' && focused);
  if (!focused) return null;
  const summary = (
    <Pressable onPress={onSummaryPress} disabled={!onSummaryPress} style={ctaFill ? styles.summary : styles.summaryFill} accessibilityRole={onSummaryPress ? 'button' : undefined}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {total ? (
        <Text style={styles.total}>
          {total}
          {onSummaryPress ? <Text style={styles.chev}> ⌃</Text> : null}
        </Text>
      ) : null}
    </Pressable>
  );
  return pinToViewport(
    <View onLayout={onLayout} style={[styles.root, { paddingBottom: 10 + insets.bottom }]} testID={testID}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {layout === 'row' ? (
        <View style={styles.row}>
          {summary}
          <View style={ctaFill ? styles.rowCta : null}>
            <MobileButton label={cta.label} onPress={cta.onPress} disabled={cta.disabled} busy={cta.busy} variant={cta.variant} height={ctaFill ? 50 : 48} style={ctaFill ? null : styles.ctaHug} />
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
    </View>,
  );
}

/** The bar is portaled out of its screen, so a screen left mounted underneath would keep showing it. */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/**
 * On web the page scrolls inside a transformed container, which turns `position: fixed`
 * into "fixed to the scroller", so the bar has to live directly under <body>.
 */
export function pinToViewport(node: React.ReactElement): React.ReactElement {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return node;
  const { createPortal } = require('react-dom') as { createPortal: (child: React.ReactNode, host: Element) => React.ReactElement };
  return createPortal(node, document.body);
}

const styles = StyleSheet.create({
  root: {
    position: Platform.OS === 'web' ? ('fixed' as unknown as 'absolute') : 'absolute',
    left: 0, right: 0, bottom: 0, zIndex: 40,
    backgroundColor: m.white, borderTopWidth: 1, borderTopColor: m.line,
    paddingHorizontal: 16, paddingTop: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCta: { flex: 1 },
  summary: { flexShrink: 1, maxWidth: '45%' },
  summaryFill: { flex: 1 },
  ctaHug: { width: 'auto', paddingHorizontal: 18, borderRadius: 8 },
  label: { fontSize: 12.5, color: m.muted, ...mFont(300), lineHeight: 16 },
  total: { fontSize: 18, color: m.ink, ...mFont(500), lineHeight: 23 },
  chev: { fontSize: 11, color: m.goldDark },
  stackTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  stackTotal: { fontSize: 17, color: m.ink, ...mFont(500) },
  hint: { fontSize: 12.5, color: m.muted, textAlign: 'center', marginBottom: 8, ...mFont(400) },
});

/** Space to leave under scroll content so the bar never covers the last row. */
export const STICKY_BAR_CLEARANCE = 96;
