import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BoxThumbRow } from '../../components/mobile/BoxSummary';
import { primaryPhoto, SAMPLE_BOX_IDS } from '../../components/mobile/catalogPhotos';
import { balanceProps, m, mFont, mGutter } from '../../components/mobile/mobileTheme';
import { useCatalog } from '../../hooks/useCatalog';
import { useBoxLockDay } from '../../hooks/useBoxLockDay';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../../services/box/boxRules';
import type { GiftPath } from '../gift/giftGiveTypes';

export const GIFT_PATH_LABEL: Record<GiftPath, string> = { customize: 'A Hanukkah box', credit_only: 'Hanukkah credit' };

/** Phone gift step 1: tabs for Customize box | Send credit, then the active path summary. */
export function MobileGiftPathCards({
  giftPath,
  onChange,
  boxesClosed,
  arrivesBefore,
  hasError,
}: {
  giftPath: GiftPath | null;
  onChange: (path: GiftPath) => void;
  boxesClosed: boolean;
  arrivesBefore: string;
  hasError?: boolean;
}) {
  const lockDay = useBoxLockDay();
  const { items } = useCatalog();
  const thumbs = useMemo(() => {
    const byId = new Map(items.map((c) => [c.id, c]));
    return SAMPLE_BOX_IDS.map((id) => ({ id, imageUrl: primaryPhoto(byId.get(id)) }));
  }, [items]);
  const from = `From ${formatCatalogDollars(listBoxCentsForKids(1))}`;
  const path = giftPath ?? (boxesClosed ? 'credit_only' : null);
  const customizeOn = path === 'customize';
  const creditOn = path === 'credit_only';

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>
          What would you like to send?
        </Text>
        <Text style={styles.sub} {...balanceProps}>
          Either way, they get a note from you and everything arrives before {arrivesBefore}.
        </Text>
      </View>
      <View style={[styles.tabs, hasError && !path ? styles.tabsError : null]} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: customizeOn, disabled: boxesClosed }}
          disabled={boxesClosed}
          onPress={() => onChange('customize')}
          style={[styles.tab, customizeOn && styles.tabOn, boxesClosed && styles.tabDisabled]}
        >
          <Text style={[styles.tabText, customizeOn && styles.tabTextOn]}>Customize a box</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: creditOn }}
          onPress={() => onChange('credit_only')}
          style={[styles.tab, creditOn && styles.tabOn]}
        >
          <Text style={[styles.tabText, creditOn && styles.tabTextOn]}>Send credit</Text>
        </Pressable>
      </View>
      {customizeOn ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{GIFT_PATH_LABEL.customize}</Text>
          <Text style={styles.panelBody}>
            {boxesClosed
              ? `Gift boxes for this Hanukkah closed on ${lockDay}. You can still send gift credit.`
              : 'We pick everything for their family. You can swap anything before you send it.'}
          </Text>
          {boxesClosed ? null : (
            <>
              <View style={{ marginTop: 12 }}>
                <BoxThumbRow items={thumbs} size="sm" />
              </View>
              <Text style={styles.price}>{from}</Text>
            </>
          )}
        </View>
      ) : null}
      {creditOn ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{GIFT_PATH_LABEL.credit_only}</Text>
          <Text style={styles.panelBody}>They build their own box with it. Anything over the credit goes on their card.</Text>
          <Text style={styles.price}>A box&apos;s worth for their family, {from.toLowerCase()}</Text>
        </View>
      ) : null}
      {!path ? (
        <Text style={styles.hint}>Choose Customize a box or Send credit to continue.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: 18, gap: 10 },
  h1: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  sub: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: mGutter,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: m.line,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: m.beige,
  },
  tabsError: { borderColor: m.warn },
  tab: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: m.ink },
  tabDisabled: { opacity: 0.45 },
  tabText: { fontSize: 14, color: m.ink, textAlign: 'center', ...mFont(500) },
  tabTextOn: { color: m.gold },
  panel: {
    marginHorizontal: mGutter,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: m.gold,
    backgroundColor: m.beige,
    gap: 6,
  },
  panelTitle: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: m.ink, ...mFont(500) },
  panelBody: { fontSize: 14, lineHeight: 20, color: m.body, ...mFont(300) },
  price: { fontSize: 13, color: m.goldDark, marginTop: 8, ...mFont(500) },
  hint: { marginHorizontal: mGutter, marginTop: 12, fontSize: 13, color: m.warn, ...mFont(400) },
});
