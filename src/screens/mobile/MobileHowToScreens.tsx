import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome, useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { HOW_TO_LIGHT_CANDLES_COPY } from '../../constants/storefrontHowToLightCandlesCopy';
import { HOW_TO_PLAY_DREIDEL_COPY } from '../../constants/storefrontHowToPlayDreidelCopy';
import { useCatalog } from '../../hooks/useCatalog';
import { getHanukkahConfig, peekHanukkahConfig } from '../../services/firestore/config';
import { getHanukkahStatus } from '../../services/hanukkah/dates';
import type { MainStackParamList } from '../../navigation/types';
import type { CatalogItem } from '../../types/pilot';
import { Hanukkiah } from '../../components/mobile/Hanukkiah';
import { ProductTileMobile } from '../../components/mobile/ProductTileMobile';
import { byId, homePhoto } from '../../components/mobile/catalogPhotos';
import { m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';
import { MobileArticleBody } from './MobileArticleBody';

type Nav = StackNavigationProp<MainStackParamList>;

function useStartsOn(): string | null {
  const [startsOn, setStartsOn] = useState<string | null>(() => peekHanukkahConfig()?.startsOn ?? null);
  useEffect(() => {
    let alive = true;
    void getHanukkahConfig().then((c) => alive && setStartsOn(c.startsOn));
    return () => {
      alive = false;
    };
  }, []);
  return startsOn;
}

/** Which night tonight is (1-8) during Hanukkah; 1 before it starts; 8 after. */
function tonightNight(startsOn: string | null, now = new Date()): { night: number; date: Date | null } {
  if (!startsOn) return { night: 1, date: null };
  const status = getHanukkahStatus(startsOn, now);
  const start = new Date(startsOn);
  if (status.phase === 'before') return { night: 1, date: start };
  if (status.phase === 'after') return { night: 8, date: new Date(start.getTime() + 7 * 86_400_000) };
  const n = Math.min(8, Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1));
  return { night: n, date: new Date(start.getTime() + (n - 1) * 86_400_000) };
}

export function MobileHowToLightCandles() {
  const navigation = useNavigation<Nav>();
  const { goCategory } = useStorefrontActions();
  const { items } = useCatalog();
  const photos = useMemo(() => byId(items), [items]);
  const startsOn = useStartsOn();
  const tonight = useMemo(() => tonightNight(startsOn), [startsOn]);
  const [night, setNight] = useState(tonight.night);
  useEffect(() => setNight(tonight.night), [tonight.night]);
  const c = HOW_TO_LIGHT_CANDLES_COPY;
  const nightDate = startsOn ? new Date(new Date(startsOn).getTime() + (night - 1) * 86_400_000) : null;
  const dateLabel = nightDate ? nightDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '';

  const need = ['beeswax-candles', 'stemless-menorah'].map((id) => photos.get(id)).filter((x): x is CatalogItem => !!x);

  const stage = (
    <View style={styles.stageWrap}>
      <View style={styles.stage}>
        <Hanukkiah night={night} width={170} label={`Night ${night}`} />
        <Text style={styles.stageDate}>
          Night {night}
          {dateLabel ? ` · ${dateLabel}` : ''}
        </Text>
        <View style={styles.nights}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Pressable
              key={n}
              onPress={() => setNight(n)}
              accessibilityRole="button"
              accessibilityLabel={`Night ${n}`}
              accessibilityState={{ selected: n === night }}
              style={[styles.night, n < night && styles.nightPast, n === night && styles.nightOn]}
            >
              <Text style={[styles.nightText, n === night && styles.nightTextOn]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.tonight}>
        <Text style={mType.h2}>Tonight</Text>
        {[
          `Put ${night === 1 ? 'one candle' : `${night} candles`} in on the right, then the shamash in the middle.`,
          'Light the shamash and say the blessings.',
          'Light the newest candle first, moving left to right.',
          'Let them burn down. The shamash goes back in its spot.',
        ].map((t, i) => (
          <View key={t} style={styles.step}>
            <View style={styles.stepN}>
              <Text style={styles.stepNText}>{i + 1}</Text>
            </View>
            <Text style={[mType.body, { flex: 1 }]}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const after = need.length ? (
    <View style={styles.need}>
      <Text style={[mType.h2, { paddingHorizontal: mGutter }]}>What you need</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {need.map((it) => (
          <ProductTileMobile key={it.id} item={it} width={150} onPress={() => navigation.navigate('CatalogProduct', { slug: it.id })} />
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <StorefrontChrome>
      <MobileArticleBody
        heroUri={homePhoto(photos, 'candlesHero')}
        eyebrow="How to"
        title="Light the candles"
        lead="One more candle each night, plus the shamash, the helper candle in the middle that lights the others."
        feature={stage}
        blocks={[
          { type: 'prose', heading: c.placement.heading, body: c.placement.body },
          { type: 'prose', heading: c.shamash.heading, body: c.shamash.body },
          { type: 'beliefs', heading: c.songs.heading, items: [...c.songs.items] },
          { type: 'prose', heading: c.after.heading, body: c.after.body },
          { type: 'prose', heading: c.nights2to8.heading, body: c.nights2to8.body },
        ]}
        after={after}
        cta={{ label: 'Shop candles', onPress: () => goCategory('candles') }}
      />
    </StorefrontChrome>
  );
}

const LETTERS: { letter: string; name: string; rule: string }[] = [
  { letter: 'נ', name: 'Nun', rule: 'Nothing happens. Next player.' },
  { letter: 'ג', name: 'Gimel', rule: 'Take the whole pot. Everyone antes again.' },
  { letter: 'ה', name: 'Hey', rule: 'Take half the pot.' },
  { letter: 'ש', name: 'Shin', rule: 'Put one in.' },
];

export function MobileHowToPlayDreidel() {
  const { goCategory } = useStorefrontActions();
  const { items } = useCatalog();
  const photos = useMemo(() => byId(items), [items]);
  const c = HOW_TO_PLAY_DREIDEL_COPY;
  const letters = (
    <View style={styles.letters}>
      {LETTERS.map((l) => (
        <View key={l.name} style={styles.letter}>
          <View style={styles.glyph}>
            <Text style={styles.glyphText}>{l.letter}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={mType.bodyStrong}>{l.name}</Text>
            <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{l.rule}</Text>
          </View>
        </View>
      ))}
    </View>
  );
  return (
    <StorefrontChrome>
      <MobileArticleBody
        heroUri={homePhoto(photos, 'dreidelHero')}
        eyebrow="How to"
        title="Play dreidel"
        lead={c.lead}
        feature={letters}
        blocks={[
          { type: 'prose', heading: c.whyWePlay.heading, body: c.whyWePlay.body },
          { type: 'prose', heading: c.setup.heading, body: c.setup.body },
          { type: 'steps', heading: c.steps.heading, items: [...c.steps.items] },
          { type: 'prose', heading: c.letters.heading, body: c.letters.body },
        ]}
        cta={{ label: 'Get dreidels', onPress: () => goCategory('dreidels') }}
      />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  stageWrap: { paddingHorizontal: mGutter, paddingTop: 20 },
  stage: { backgroundColor: m.white, borderWidth: 1, borderColor: m.line, borderRadius: 18, paddingTop: 32, paddingBottom: 16, paddingHorizontal: 12, alignItems: 'center', gap: 14 },
  stageDate: { fontSize: 14, color: m.goldDark, textAlign: 'center', ...mFont(400) },
  nights: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 6 },
  night: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white, borderWidth: 1, borderColor: m.lineWarm },
  nightPast: { backgroundColor: m.beige, borderColor: m.beige },
  nightOn: { backgroundColor: m.ink, borderColor: m.ink },
  nightText: { fontSize: 14, color: m.goldDark, ...mFont(400) },
  nightTextOn: { color: m.gold },
  tonight: { paddingTop: 22 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 14 },
  stepN: { width: 28, height: 28, borderRadius: 14, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: m.goldDark, fontSize: 13, ...mFont(500) },
  need: { paddingTop: 8, paddingBottom: 8 },
  rail: { paddingHorizontal: mGutter, gap: 12, paddingTop: 14 },
  letters: { paddingHorizontal: mGutter, paddingTop: 20, gap: 10 },
  letter: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: mRadius.md, backgroundColor: m.beige },
  glyph: { width: 48, height: 48, borderRadius: mRadius.md, backgroundColor: m.white, alignItems: 'center', justifyContent: 'center' },
  glyphText: { fontSize: 26, color: m.ink },
});
