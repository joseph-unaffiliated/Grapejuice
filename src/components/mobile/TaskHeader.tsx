import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { m, mFont, TAP } from './mobileTheme';

type Props = {
  /** "Back", "Cancel", "Box"… Omit for no back control. */
  back?: { label: string; onPress: () => void } | null;
  title?: string;
  /** Short text on the right: "Step 2 of 4", "Secure". */
  right?: string | React.ReactNode;
  /** Progress bars under the row; `on` is the active index. */
  steps?: string[];
  on?: number;
  /** Replaces the logomark in the middle (the Rav screen passes the Rav icon). */
  mark?: React.ReactNode;
};

/**
 * The one header for every flow on the phone: back on the left, the site's logomark
 * and a title in the middle, a step count or "Secure" on the right, optional progress.
 * Browsing pages keep the site header; this is for onboarding, checkout, gifts, sign-in, Rav.
 */
export function TaskHeader({ back, title, right, steps, on = 0, mark }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {back ? (
            <Pressable onPress={back.onPress} accessibilityRole="button" accessibilityLabel={back.label} style={styles.back} hitSlop={8}>
              <Text style={styles.backText}>‹ {back.label}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.mid}>
          {mark ?? <GrapejuiceBrandMark markOnly width={22} height={22} color={m.ink} />}
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
        </View>
        <View style={[styles.side, styles.sideRight]}>
          {typeof right === 'string' ? <Text style={styles.right}>{right}</Text> : right ?? null}
        </View>
      </View>
      {steps?.length ? (
        <View style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: on + 1 }}>
          {steps.map((label, i) => (
            <View key={label} style={styles.step}>
              <View style={[styles.bar, i <= on && styles.barOn]} />
              <Text style={[styles.stepLabel, i === on && styles.stepLabelOn]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: m.white, borderBottomWidth: 1, borderBottomColor: m.line },
  row: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  back: { height: TAP, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: m.goldDark, fontSize: 14, ...mFont(400) },
  mid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, color: m.ink, ...mFont(500) },
  right: { fontSize: 12, color: m.muted, ...mFont(400) },
  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  step: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: m.line },
  barOn: { backgroundColor: m.gold },
  stepLabel: { fontSize: 11.5, color: m.muted, ...mFont(400) },
  stepLabelOn: { color: m.ink, ...mFont(500) },
});
