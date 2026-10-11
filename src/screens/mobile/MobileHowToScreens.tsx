import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { byId, homePhoto, primaryPhoto } from '../../components/mobile/catalogPhotos';
import { m, mFont } from '../../components/mobile/mobileTheme';
import { useBoxGlance } from '../../hooks/useBoxGlance';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import { ArticleH2, ArticleMoreRows, ArticleSteps, MobileArticleBody, SheetParagraphs } from './MobileArticleBody';

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
  const { startBox } = useStorefrontActions();
  const { items } = useCatalog();
  const photos = useMemo(() => byId(items), [items]);
  const startsOn = useStartsOn();
  const tonight = useMemo(() => tonightNight(startsOn), [startsOn]);
  const [night, setNight] = useState(tonight.night);
  useEffect(() => setNight(tonight.night), [tonight.night]);
  const c = HOW_TO_LIGHT_CANDLES_COPY;
  const nightDate = startsOn ? new Date(new Date(startsOn).getTime() + (night - 1) * 86_400_000) : null;
  const dateLabel = nightDate ? nightDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '';

  return (
    <StorefrontChrome>
      <MobileArticleBody
        eyebrow="How to"
        title="Light the candles"
        lead="One more candle each night, plus the shamash, the helper candle in the middle that lights the others."
        band={{ title: 'Everything for all eight nights', sub: 'Candles, dreidels, gelt, food kits, a book and a present for each kid.', cta: { label: 'Build my box · from $80', onPress: startBox } }}
      >
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
        <ArticleH2>Tonight</ArticleH2>
        <ArticleSteps
          items={[
            `Put ${night === 1 ? 'one candle' : `${night} candles`} in on the right, then the shamash in the middle.`,
            'Light the shamash and say the blessings.',
            night === 1 ? 'Use the shamash to light the candle.' : 'Light the newest candle first, moving left to right.',
            'Set the menorah in a window so people passing can see it.',
          ]}
        />
        <ArticleMoreRows
          rows={[
            { title: 'The blessings', sub: 'One prayer, two songs, all optional', body: <SheetParagraphs items={[{ body: c.songs.body }, ...c.songs.items]} /> },
            { title: 'Where to put it and the shamash', sub: 'Visible from the street, if it is safe', body: <SheetParagraphs items={[{ title: c.placement.heading, body: c.placement.body }, { title: c.shamash.heading, body: c.shamash.body }, { title: c.nights2to8.heading, body: c.nights2to8.body }]} /> },
            { title: c.after.heading, sub: 'Presents, latkes, dreidel, or the story', body: <SheetParagraphs items={[{ body: c.after.body }]} /> },
          ]}
        />
        <ArticleH2>What you need</ArticleH2>
        <NeedRows ids={['beeswax-candles', 'stemless-menorah']} photos={photos} />
      </MobileArticleBody>
    </StorefrontChrome>
  );
}

/** What you need (content.html .need): thumbnail, name, "In your box" or the price and an Add pill. */
function NeedRows({ ids, photos, note }: { ids: string[]; photos: Map<string, CatalogItem>; note?: Record<string, string> }) {
  const navigation = useNavigation<Nav>();
  const glance = useBoxGlance();
  const inBox = useMemo(() => new Set(glance.lineItems.map((l) => l.itemId)), [glance.lineItems]);
  const rows = ids.map((id) => photos.get(id)).filter((x): x is CatalogItem => !!x);
  return (
    <View>
      {rows.map((it) => {
        const mine = inBox.has(it.id);
        const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(it);
        const open = () => navigation.navigate('CatalogProduct', { slug: it.id });
        return (
          <Pressable key={it.id} onPress={open} accessibilityRole="button" accessibilityLabel={`Open ${it.name}`} style={styles.need}>
            <Image source={{ uri: primaryPhoto(it) ?? undefined }} style={styles.needThumb} resizeMode="cover" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.needName} numberOfLines={1}>{it.name}</Text>
              <Text style={[styles.needSub, mine && { color: m.goldDark }]}>
                {mine ? `In your box${note?.[it.id] ? ` · ${note[it.id]}` : ''}` : formatCatalogDollars(nonMemberCents > 0 ? nonMemberCents : memberCents)}
              </Text>
            </View>
            {mine ? null : (
              <View style={styles.addPill}>
                <Text style={styles.addPillText}>+ Add</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const LETTERS: { letter: string; name: string; rule: string }[] = [
  { letter: 'נ', name: 'Nun', rule: 'Nothing happens' },
  { letter: 'ג', name: 'Gimmel', rule: 'Take the whole pot' },
  { letter: 'ה', name: 'Hey', rule: 'Take half the pot' },
  { letter: 'ש', name: 'Shin', rule: 'Put one in' },
];

export function MobileHowToPlayDreidel() {
  const { startBox } = useStorefrontActions();
  const { items } = useCatalog();
  const photos = useMemo(() => byId(items), [items]);
  const glance = useBoxGlance();
  const c = HOW_TO_PLAY_DREIDEL_COPY;
  return (
    <StorefrontChrome>
      <MobileArticleBody
        heroUri={homePhoto(photos, 'dreidelHero')}
        eyebrow="How to"
        title="Play dreidel"
        lead="Everyone starts with the same pile of gelt. Each player puts one in the middle, then takes turns spinning."
        band={{
          title: 'Dreidels and gelt are in every box',
          sub: `Plus candles, food kits, a book and a present for each kid. Change anything until ${glance.lockShort}.`,
          cta: { label: 'Build my box · from $80', onPress: startBox },
        }}
      >
        <View style={styles.letters}>
          {LETTERS.map((l) => (
            <View key={l.name} style={styles.letter}>
              <Text style={styles.he}>{l.letter}</Text>
              <Text style={styles.letterName}>{l.name}</Text>
              <Text style={styles.letterRule}>{l.rule}</Text>
            </View>
          ))}
        </View>
        <ArticleH2>Good to know</ArticleH2>
        <ArticleSteps
          items={[
            'When the pot is empty, everyone puts one in again.',
            "Out of gelt? You're out. Last player with gelt wins.",
            'Little kids can play for fun. Nobody has to lose their gelt.',
          ]}
        />
        <ArticleMoreRows
          rows={[
            { title: 'The full rules', sub: 'Ante, spin, and what each letter does', body: <SheetParagraphs items={[{ title: c.setup.heading, body: c.setup.body }, ...c.steps.items]} /> },
            { title: c.whyWePlay.heading, sub: 'A game that hid a story', body: <SheetParagraphs items={[{ body: c.whyWePlay.body }, { title: c.letters.heading, body: c.letters.body }]} /> },
          ]}
        />
        <ArticleH2>What you need</ArticleH2>
        <NeedRows ids={['classic-wooden-dreidel', 'big-bag-of-gelt']} photos={photos} note={{ 'classic-wooden-dreidel': '1 per person' }} />
      </MobileArticleBody>
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: m.white, borderWidth: 1, borderColor: m.line, borderRadius: 18, paddingTop: 32, paddingBottom: 16, paddingHorizontal: 12, alignItems: 'center', gap: 14 },
  stageDate: { fontSize: 14, color: m.goldDark, textAlign: 'center', ...mFont(400) },
  nights: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 6 },
  night: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white, borderWidth: 1, borderColor: m.lineWarm },
  nightPast: { backgroundColor: m.beige, borderColor: m.beige },
  nightOn: { backgroundColor: m.ink, borderColor: m.ink },
  nightText: { fontSize: 14, color: m.goldDark, ...mFont(400) },
  nightTextOn: { color: m.gold },
  need: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: m.line },
  needThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: m.img },
  needName: { fontSize: 15, lineHeight: 20, color: m.ink, ...mFont(400) },
  needSub: { fontSize: 13, lineHeight: 18, color: m.muted, marginTop: 2, ...mFont(400) },
  addPill: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: m.ink, alignItems: 'center', justifyContent: 'center' },
  addPillText: { fontSize: 12, color: m.gold, ...mFont(400) },
  letters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  letter: { width: '48.6%', borderWidth: 1, borderColor: m.line, borderRadius: 14, padding: 14, gap: 4 },
  he: { fontSize: 34, lineHeight: 36, color: m.ink, textAlign: 'left', writingDirection: 'ltr', ...mFont(400) },
  letterName: { fontSize: 15, lineHeight: 20, color: m.ink, ...mFont(500) },
  letterRule: { fontSize: 13, lineHeight: 18, color: m.muted, ...mFont(400) },
});
