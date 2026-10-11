import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { balanceProps, m, mFont, mGutter } from '../../components/mobile/mobileTheme';

type Props = {
  /** Secondary photo at the top (heroes may use secondary photography). */
  heroUri?: string | null;
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
  /** The dark closing band (content.html ctaBand). */
  band?: { title: string; sub: string; cta: { label: string; onPress: () => void } };
};

/** The phone article layout (content.html): optional photo, eyebrow, title, lead, the page's modules, a dark closing band. */
export function MobileArticleBody({ heroUri, eyebrow, title, lead, children, band }: Props) {
  return (
    <View style={styles.root}>
      {heroUri ? <Image source={{ uri: heroUri }} style={styles.hero} resizeMode="cover" /> : null}
      <View style={styles.art}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.h1} role="heading" aria-level={1} {...balanceProps}>
          {title}
        </Text>
        {lead ? <Text style={styles.p} {...balanceProps}>{lead}</Text> : null}
        {children}
      </View>
      {band ? (
        <View style={styles.band}>
          <Text style={styles.bandTitle} {...balanceProps}>{band.title}</Text>
          <Text style={styles.bandSub} {...balanceProps}>{band.sub}</Text>
          <Pressable onPress={band.cta.onPress} accessibilityRole="button" style={styles.bandCta}>
            <Text style={styles.bandCtaText}>{band.cta.label}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ height: 40 }} />
      )}
    </View>
  );
}

export function ArticleH2({ children }: { children: string }) {
  return <Text style={styles.h2}>{children}</Text>;
}

/** Numbered steps (content.html .howto). */
export function ArticleSteps({ items }: { items: string[] }) {
  return (
    <View style={styles.howto}>
      {items.map((t, i) => (
        <View key={t} style={styles.howtoRow}>
          <View style={styles.n}>
            <Text style={styles.nText}>{i + 1}</Text>
          </View>
          <Text style={styles.howtoText} {...balanceProps}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** List rows that open the longer copy in a sheet. */
export function ArticleMoreRows({ rows }: { rows: { title: string; sub: string; body: React.ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const row = open != null ? rows[open] : null;
  return (
    <View style={{ marginTop: 6 }}>
      {rows.map((r, i) => (
        <Pressable key={r.title} onPress={() => setOpen(i)} accessibilityRole="button" style={styles.listRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.listT}>{r.title}</Text>
            <Text style={styles.listS} numberOfLines={1}>{r.sub}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
      <MobileSheet visible={row != null} onClose={() => setOpen(null)} title={row?.title ?? ''}>
        {row?.body}
      </MobileSheet>
    </View>
  );
}

export function SheetParagraphs({ items }: { items: { title?: string; body: string }[] }) {
  return (
    <View style={{ gap: 14 }}>
      {items.map((it, i) => (
        <View key={i}>
          {it.title ? <Text style={styles.sheetTitle}>{it.title}</Text> : null}
          <Text style={styles.sheetBody}>{it.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: m.white },
  hero: { width: '100%', height: 220, backgroundColor: m.img },
  art: { paddingHorizontal: mGutter, paddingTop: 24, gap: 14 },
  eyebrow: { fontSize: 13, lineHeight: 18, color: m.goldDark, marginBottom: -4, ...mFont(400) },
  h1: { fontSize: 31, lineHeight: 35, letterSpacing: -0.9, color: m.ink, ...mFont(400) },
  p: { fontSize: 16, lineHeight: 26, color: '#2B2B2B', ...mFont(300) },
  h2: { fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: m.ink, marginTop: 14, ...mFont(400) },
  howto: { gap: 16, marginTop: 4 },
  howtoRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  n: { width: 28, height: 28, borderRadius: 14, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  nText: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  howtoText: { flex: 1, fontSize: 15, lineHeight: 22.5, color: '#2B2B2B', ...mFont(300) },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: m.line },
  listT: { fontSize: 16, color: m.ink, ...mFont(400) },
  listS: { fontSize: 13, color: m.muted, marginTop: 2, ...mFont(300) },
  chev: { fontSize: 20, color: m.goldDark },
  sheetTitle: { fontSize: 16, lineHeight: 22, color: m.ink, marginBottom: 4, ...mFont(500) },
  sheetBody: { fontSize: 15, lineHeight: 23, color: m.body, ...mFont(300) },
  band: { marginTop: 32, backgroundColor: m.ink, paddingHorizontal: mGutter, paddingVertical: 36, gap: 10 },
  bandTitle: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.white, ...mFont(400) },
  bandSub: { fontSize: 14.5, lineHeight: 21, color: '#C9C9C9', ...mFont(300) },
  bandCta: { alignSelf: 'flex-start', marginTop: 4, height: 48, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: m.gold, alignItems: 'center', justifyContent: 'center' },
  bandCtaText: { fontSize: 15.5, color: m.gold, ...mFont(500) },
});
