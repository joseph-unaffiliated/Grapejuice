import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { MobileButton } from '../../components/mobile/MobileButton';
import { balanceProps, m, mFont, mGutter } from '../../components/mobile/mobileTheme';

const DOORSTEP = require('../../../assets/storefront/box-doorstep.jpg');

const STEPS = [
  { title: 'Tell us about their family', body: "How many kids and their ages. We'll pick the rest." },
  { title: "Make it yours, or don't", body: 'Swap anything in their box, then add a note.' },
  { title: 'They add their address', body: 'We email them. Or keep it a surprise and ship it straight to them.' },
];

type Props = {
  lockShort: string;
  faq: { title: string; body: string }[];
  onGive: () => void;
};

/** Phone gift landing (gift.html s=1): short photo, send-by pill, one CTA, cream steps, questions. */
function firstSentence(text: string): string {
  const m1 = /^.*?[.?!](\s|$)/.exec(text);
  return (m1 ? m1[0] : text).trim();
}

export function MobileGiftLandingBody({ lockShort, faq, onGive }: Props) {
  const [open, setOpen] = useState<{ title: string; body: string } | null>(null);
  return (
    <View style={styles.root}>
      <Image source={DOORSTEP} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.hero}>
        <View style={styles.banner}>
          <Icon icon={icons.gift} size={14} color={m.goldDark} />
          <Text style={styles.bannerText}>Send by {lockShort}</Text>
        </View>
        <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>
          Send Hanukkah to another family
        </Text>
        <Text style={styles.lede} {...balanceProps}>
          A box with everything for eight nights, picked for their kids. Or send credit and let them choose.
        </Text>
        <MobileButton label="Send a gift · from $80" onPress={onGive} height={54} />
      </View>

      <View style={[styles.band, styles.cream]}>
        <Text style={[styles.h2, { paddingHorizontal: mGutter, marginBottom: 18 }]}>How gifting works</Text>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={styles.step}>
              <View style={styles.n}>
                <Text style={styles.nText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody} {...balanceProps}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.band, { paddingHorizontal: mGutter }]}>
        <Text style={[styles.h2, { marginBottom: 6 }]}>Questions</Text>
        {faq.map((q, i) => (
          <Pressable key={q.title} onPress={() => setOpen(q)} accessibilityRole="button" style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle}>{q.title}</Text>
              <Text style={styles.rowBody} numberOfLines={1}>{firstSentence(q.body)}</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </View>
      <MobileSheet visible={open != null} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        <Text style={styles.sheetBody}>{open?.body}</Text>
      </MobileSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: m.white },
  photo: { width: '100%', height: 250, backgroundColor: m.img },
  hero: { paddingHorizontal: mGutter, paddingTop: 22, paddingBottom: 26, gap: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingVertical: 6, paddingLeft: 8, paddingRight: 12, borderRadius: 16, backgroundColor: m.beige },
  bannerText: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  h1: { fontSize: 32, lineHeight: 36, letterSpacing: -1, color: m.ink, ...mFont(400) },
  lede: { fontSize: 15.5, lineHeight: 23, color: m.body, ...mFont(300) },
  band: { paddingVertical: 36 },
  cream: { backgroundColor: m.beige },
  h2: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.ink, ...mFont(400) },
  steps: { paddingHorizontal: mGutter, gap: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  n: { width: 32, height: 32, borderRadius: 16, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  nText: { fontSize: 15, color: m.goldDark, ...mFont(500) },
  stepTitle: { fontSize: 16, lineHeight: 22, color: m.ink, ...mFont(500) },
  stepBody: { fontSize: 14, lineHeight: 20, color: m.muted, ...mFont(400) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: m.line },
  rowTitle: { fontSize: 15.5, lineHeight: 21, color: m.ink, ...mFont(400) },
  rowBody: { fontSize: 13, lineHeight: 18, color: m.muted, marginTop: 2, ...mFont(300) },
  chev: { fontSize: 20, color: m.goldDark, ...mFont(400) },
  sheetBody: { fontSize: 15, lineHeight: 23, color: m.body, ...mFont(300) },
});
