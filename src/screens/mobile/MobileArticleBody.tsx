import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StorefrontArticleBlock, StorefrontArticleProseLine } from '../../components/storefront/StorefrontArticlePage';
import { MobileButton } from '../../components/mobile/MobileButton';
import { balanceProps, m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';

type Props = {
  /** Secondary photo at the top (heroes may use secondary photography). */
  heroUri?: string | null;
  /** Bundled image for the hero (require()). */
  heroSource?: number;
  eyebrow?: string;
  title: string;
  lead?: string;
  /** Rendered between the lead and the copy blocks (the hanukkiah stage, the letters). */
  feature?: React.ReactNode;
  blocks: readonly StorefrontArticleBlock[];
  /** Rendered after the blocks (what you need, a closing card). */
  after?: React.ReactNode;
  cta?: { label: string; onPress: () => void };
};

/** The phone article layout: photo, eyebrow, title, lead, a feature, then the same copy blocks the desktop article uses. */
export function MobileArticleBody({ heroUri, heroSource, eyebrow, title, lead, feature, blocks, after, cta }: Props) {
  return (
    <View style={styles.root}>
      {heroSource ? <Image source={heroSource} style={styles.hero} resizeMode="cover" /> : heroUri ? <Image source={{ uri: heroUri }} style={styles.hero} resizeMode="cover" /> : null}
      <View style={styles.pad}>
        {eyebrow ? <Text style={mType.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[mType.h1, { marginTop: 4 }]} {...balanceProps}>
          {title}
        </Text>
        {lead ? <Text style={[mType.body, { marginTop: 10 }]}>{lead}</Text> : null}
      </View>
      {feature}
      <View style={styles.pad}>
        {blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </View>
      {after}
      {cta ? (
        <View style={[styles.pad, { paddingBottom: 36 }]}>
          <MobileButton label={cta.label} onPress={cta.onPress} />
        </View>
      ) : null}
    </View>
  );
}

function lineText(line: StorefrontArticleProseLine): string {
  return typeof line === 'string' ? line : line.body;
}

function Block({ block }: { block: StorefrontArticleBlock }) {
  switch (block.type) {
    case 'prose': {
      const paragraphs = typeof block.body === 'string' ? [block.body] : block.body.map((p) => (Array.isArray(p) ? p.map(lineText).join('') : lineText(p as StorefrontArticleProseLine)));
      return (
        <View style={styles.block}>
          {block.heading ? <Text style={mType.h2}>{block.heading}</Text> : null}
          {paragraphs.map((p, i) => (
            <Text key={i} style={[mType.body, { marginTop: i === 0 && block.heading ? 8 : 10 }]}>
              {p}
            </Text>
          ))}
        </View>
      );
    }
    case 'steps':
      return (
        <View style={styles.block}>
          {block.heading ? <Text style={mType.h2}>{block.heading}</Text> : null}
          {block.items.map((it, i) => (
            <View key={it.title} style={styles.step}>
              <View style={styles.stepN}>
                <Text style={styles.stepNText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mType.bodyStrong}>{it.title}</Text>
                {it.body ? <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{it.body}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      );
    case 'beliefs': {
      const items = block.items ?? block.sections?.flatMap((s) => s.items ?? s.groups?.flatMap((g) => g.items) ?? []) ?? [];
      return (
        <View style={styles.block}>
          {block.heading ? <Text style={mType.h2}>{block.heading}</Text> : null}
          {items.map((it) => (
            <View key={it.title} style={styles.belief}>
              <Text style={mType.bodyStrong}>{it.title.replace(/[˘ˇ]/g, '')}</Text>
              <Text style={[mType.body, { marginTop: 4 }]}>{it.body}</Text>
            </View>
          ))}
        </View>
      );
    }
    case 'missions':
      return (
        <View style={styles.block}>
          {block.heading ? <Text style={mType.h2}>{block.heading}</Text> : null}
          {block.items.map((it) => (
            <View key={it.num} style={styles.step}>
              <View style={styles.stepN}>
                <Text style={styles.stepNText}>{it.num}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mType.bodyStrong}>{it.title}</Text>
                <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{it.body}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    default:
      // Visual placeholders, bands and roadmaps have phone-specific replacements passed as `feature` / `after`.
      return null;
  }
}

const styles = StyleSheet.create({
  root: { paddingBottom: 12 },
  hero: { width: '100%', aspectRatio: 390 / 250, backgroundColor: m.img },
  pad: { paddingHorizontal: mGutter, paddingTop: 22 },
  block: { marginBottom: 26 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 14 },
  stepN: { width: 28, height: 28, borderRadius: 14, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: m.goldDark, fontSize: 13, ...mFont(500) },
  belief: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: m.line },
  card: { marginHorizontal: mGutter, borderRadius: mRadius.lg, backgroundColor: m.beige, padding: 16 },
});
