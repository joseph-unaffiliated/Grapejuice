import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { balanceProps, m, mFont, mGutter } from '../../components/mobile/mobileTheme';
import type { GiftPath } from '../gift/giftGiveTypes';

export const GIFT_PATH_LABEL: Record<GiftPath, string> = { customize: 'A Hanukkah box', credit_only: 'Hanukkah credit' };

const TABS: { path: GiftPath; label: string }[] = [
  { path: 'customize', label: 'Customize a box' },
  { path: 'credit_only', label: 'Send credit' },
];

/**
 * Path switcher for the first gift screen — same ink/gold chip language as Orders/Gifts tabs.
 * Toggles kids vs credit-amount modules; not its own wizard step.
 */
export function MobileGiftPathTabs({
  giftPath,
  onChange,
  boxesClosed,
  hasError,
}: {
  giftPath: GiftPath;
  onChange: (path: GiftPath) => void;
  boxesClosed: boolean;
  hasError?: boolean;
}) {
  return (
    <View
      style={[styles.row, hasError ? styles.rowError : null]}
      accessibilityRole="tablist"
      accessibilityLabel="Gift type"
    >
      {TABS.map(({ path, label }) => {
        const on = giftPath === path;
        const disabled = path === 'customize' && boxesClosed;
        return (
          <Pressable
            key={path}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(path)}
            style={[styles.chip, on && styles.chipOn, disabled && styles.chipDisabled]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** @deprecated Use MobileGiftPathTabs — kept for any lingering imports. */
export function MobileGiftPathCards(props: {
  giftPath: GiftPath | null;
  onChange: (path: GiftPath) => void;
  boxesClosed: boolean;
  arrivesBefore: string;
  hasError?: boolean;
}) {
  const path = props.giftPath ?? (props.boxesClosed ? 'credit_only' : 'customize');
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>
          What would you like to send?
        </Text>
        <Text style={styles.sub} {...balanceProps}>
          Either way, they get a note from you and everything arrives before {props.arrivesBefore}.
        </Text>
      </View>
      <MobileGiftPathTabs
        giftPath={path}
        onChange={props.onChange}
        boxesClosed={props.boxesClosed}
        hasError={props.hasError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: mGutter, paddingTop: 24, paddingBottom: 14, gap: 10 },
  h1: { fontSize: 27, lineHeight: 31, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  sub: { fontSize: 15, lineHeight: 22, color: m.body, ...mFont(300) },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: mGutter,
    marginBottom: 8,
  },
  rowError: { /* chips themselves stay gold; parent can still signal */ },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: m.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: m.white,
  },
  chipOn: { backgroundColor: m.ink, borderColor: m.ink },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 13, color: m.ink, ...mFont(400) },
  chipTextOn: { color: m.gold },
});
