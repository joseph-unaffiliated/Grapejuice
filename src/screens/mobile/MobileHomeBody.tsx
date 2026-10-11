import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import { STOREFRONT_HERO } from '../../constants/storefrontMedia';
import { StorefrontWebVideo } from '../../components/storefront/StorefrontWebVideo';
import { BOX_DISPLAY_SECTIONS } from '../../constants/boxDisplaySections';
import type { CatalogItem } from '../../types/pilot';
import type { MainStackParamList } from '../../navigation/types';
import { useBoxGlance, NOT_HELD_COPY } from '../../hooks/useBoxGlance';
import { BoxSummary } from '../../components/mobile/BoxSummary';
import { MobileButton } from '../../components/mobile/MobileButton';
import { ProductTileMobile } from '../../components/mobile/ProductTileMobile';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { byId, homePhoto, TOP_PICK_IDS } from '../../components/mobile/catalogPhotos';
import { balanceProps, m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';
import { getHanukkahStatus } from '../../services/hanukkah/dates';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  items: CatalogItem[];
  startBox: () => void;
  goCategory: (slug: string) => void;
  goCheckout: () => void;
  goMyBox: () => void;
  goGift: () => void;
  startsOn: string | null;
};

const DOORSTEP = require('../../../assets/storefront/box-doorstep.jpg');

const PRACTICE_LINES: Record<string, string> = {
  candles: 'Beeswax candles and the blessings, one more each night.',
  dreidel: 'Dreidels, gelt and the rules of the game.',
  food: 'Latke and sufganiyot kits, and the recipes.',
  story: 'A book for each kid, picked for their age.',
  presents: 'Wrapping paper and a present for each kid.',
};

/**
 * The phone homepage from the mockups: a photo mosaic with the banner reel, one line
 * with the price, "Build my box", the three promises, "Eight nights, one box", how it
 * works, shop by category, top picks, the gift band. Returning visitors see their box
 * card instead of the hero. Rendered inside StorefrontChrome (site header and footer).
 */
export function MobileHomeBody({ items, startBox, goCategory, goCheckout, goMyBox, goGift, startsOn }: Props) {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const glance = useBoxGlance();
  const photos = useMemo(() => byId(items), [items]);
  const heroRef = useRef<View>(null);
  const [heroGone, setHeroGone] = useState(false);
  const inner = width - mGutter * 2;

  // The sticky "Build my box" bar appears once the hero (or box card) scrolls away.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    const node = heroRef.current as unknown as Element | null;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting), { threshold: 0 });
    io.observe(node);
    return () => io.disconnect();
  }, [glance.state]);

  const firstCandle = useMemo(() => {
    if (!startsOn) return null;
    const d = new Date(startsOn);
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
    return days > 0 ? `First candle in ${days} days · ${label}` : `First candle ${label}`;
  }, [startsOn]);
  const status = getHanukkahStatus(startsOn);
  const beforeHanukkah = status.phase === 'before';

  const topPicks = TOP_PICK_IDS.map((id) => photos.get(id)).filter((x): x is CatalogItem => !!x);
  const openProduct = (slug: string) => navigation.navigate('CatalogProduct', { slug });

  const promises = (
    <View style={styles.promises}>
      <Promise icon={icons.boxOpen} text="Free shipping" />
      <Promise icon={icons.pen} text={`Change anything until ${glance.lockShort}`} />
      <Promise icon={icons.calendar} text="Charged when it ships" />
    </View>
  );

  const hero =
    glance.state === 'none' ? (
      <View ref={heroRef} collapsable={false}>
        <View style={styles.mosaic}>
          <View style={[styles.mosaicBig, { width: (inner + 0) * 0.62, height: inner * 0.62 }]}>
            <StorefrontWebVideo src={resolveUri(STOREFRONT_HERO.src)} poster={STOREFRONT_HERO.poster} style={styles.fill} load="eager" />
          </View>
          <View style={styles.mosaicCol}>
            <Photo uri={homePhoto(photos, 'mosaicLatkes')} style={styles.mosaicSquare} />
            <View style={styles.mosaicPair}>
              <Photo uri={homePhoto(photos, 'mosaicDrawing')} style={styles.mosaicSmall} />
              <Photo uri={homePhoto(photos, 'mosaicGimmel')} style={styles.mosaicSmall} />
            </View>
          </View>
        </View>
        <View style={styles.pad}>
          <Text style={mType.h1} {...balanceProps}>
            Hanukkah, delivered to your door. <Text style={styles.h1Gold}>One box, $80.</Text>
          </Text>
          <Text style={[mType.body, styles.sub]} {...balanceProps}>
            Candles, dreidels, gelt, food kits, a book and a present for each kid. Picked for your family, delivered before {beforeHanukkah && firstCandle ? firstCandle.split(' · ')[1] : 'the first night'}.
          </Text>
          <MobileButton label="Build my box" onPress={startBox} />
          {promises}
        </View>
      </View>
    ) : (
      <View ref={heroRef} collapsable={false} style={styles.pad}>
        <Text style={mType.eyebrow}>Welcome back</Text>
        <Text style={[mType.h1, { marginTop: 4 }]}>{glance.state === 'set' ? 'Your box is set' : 'Your box is waiting'}</Text>
        <BoxSummary total={glance.totalLabel} items={glance.thumbs} style={{ marginTop: 12 }}>
          {glance.state === 'set' ? (
            <>
              <Text style={styles.pill}>Set · ships after {glance.lockShort}</Text>
              <Line icon={icons.pen} text={`Change anything until ${glance.lockShort}. Charged when it ships.`} />
            </>
          ) : (
            <>
              <Line icon={icons.calendar} text={`Change anything until ${glance.lockShort}`} />
              {!glance.cardOnFile ? <Text style={styles.held}>{NOT_HELD_COPY}</Text> : null}
            </>
          )}
          <MobileButton label={glance.state === 'set' ? 'View my box' : 'Add shipping and payment'} onPress={glance.state === 'set' ? goMyBox : goCheckout} height={48} />
          <MobileButton label={glance.state === 'set' ? 'Shop extras' : 'Keep editing'} onPress={glance.state === 'set' ? () => goCategory('collection') : goMyBox} variant="secondary" height={48} />
        </BoxSummary>
      </View>
    );

  return (
    <View style={{ paddingBottom: heroGone && glance.state === 'none' ? STICKY_BAR_CLEARANCE : 0 }}>
      {hero}

      <View style={[styles.section, styles.beige]}>
        <Text style={mType.h2}>Eight nights, one box</Text>
        <Text style={[mType.body, { marginTop: 4, marginBottom: 14 }]}>Picked for your kids' ages and how your family celebrates. Swap anything you like.</Text>
        {BOX_DISPLAY_SECTIONS.map((s) => (
          <View key={s.id} style={styles.practice}>
            <Photo uri={homePhoto(photos, practicePhotoKey(s.id))} style={styles.practicePhoto} />
            <View style={{ flex: 1 }}>
              <Text style={mType.h3}>{s.title}</Text>
              <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{PRACTICE_LINES[s.id]}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={mType.h2}>How it works</Text>
        <Step n="1" title="Tell us about your family" text="Kids' ages and how you celebrate. Two minutes." />
        <Step n="2" title="We pick everything" text="A full box for eight nights. You see it all before you pay." />
        <Step n="3" title={`Swap anything until ${glance.lockShort}`} text="Your card is charged when it ships, in time for the first night." />
      </View>

      <View style={[styles.section, { paddingBottom: 8 }]}>
        <View style={styles.rowHead}>
          <Text style={mType.h2}>Shop by category</Text>
          <Pressable onPress={() => goCategory('collection')} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Shop all</Text>
          </Pressable>
        </View>
        <View style={styles.cats}>
          {(
            [
              ['Menorahs', 'menorahs', 'catMenorahs'],
              ['Stuffies', 'stuffies', 'catStuffies'],
              ['Activities', 'activity', 'catActivities'],
              ['Candles', 'candles', 'catCandles'],
              ['Dreidels', 'dreidels', 'catDreidels'],
              ['Food', 'food', 'catFood'],
            ] as const
          ).map(([label, slug, key]) => (
            <Pressable key={slug} onPress={() => goCategory(slug)} accessibilityRole="button" accessibilityLabel={label} style={[styles.cat, { width: (inner - 10) / 2, height: (inner - 10) / 2 }]}>
              <Photo uri={homePhoto(photos, key)} style={styles.fill} />
              <View style={styles.catLabel}>
                <Text style={styles.catLabelText}>{label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {topPicks.length ? (
        <View style={[styles.section, { paddingTop: 8, paddingHorizontal: 0 }]}>
          <View style={[styles.rowHead, { paddingHorizontal: mGutter }]}>
            <Text style={mType.h2}>Top picks</Text>
            <Pressable onPress={() => goCategory('collection')} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {topPicks.map((it) => (
              <ProductTileMobile key={it.id} item={it} width={150} onPress={() => openProduct(it.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <Pressable onPress={goGift} accessibilityRole="button" style={styles.giftBand}>
          <Image source={DOORSTEP} style={styles.giftPhoto} resizeMode="cover" />
          <View style={styles.giftText}>
            <Text style={mType.eyebrow}>Send a gift</Text>
            <Text style={[mType.h3, { marginTop: 2 }]} {...balanceProps}>
              A whole Hanukkah, delivered to another family
            </Text>
            <Text style={[mType.small, { marginTop: 4 }]}>They pick the book and presents. From $80.</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>

      {heroGone && glance.state === 'none' ? (
        <StickyBar label="Everything for eight nights" total="From $80" cta={{ label: 'Build my box', onPress: startBox }} testID="mobile-home-bar" />
      ) : null}
    </View>
  );
}

function practicePhotoKey(id: string): 'practiceCandles' | 'practiceDreidel' | 'practiceEat' | 'practiceStory' | 'practiceGifts' {
  switch (id) {
    case 'candles':
      return 'practiceCandles';
    case 'dreidel':
      return 'practiceDreidel';
    case 'food':
      return 'practiceEat';
    case 'story':
      return 'practiceStory';
    default:
      return 'practiceGifts';
  }
}

function resolveUri(src: unknown): string {
  if (typeof src === 'string') return src;
  if (typeof src === 'number') return Image.resolveAssetSource(src)?.uri ?? '';
  if (src && typeof src === 'object' && 'uri' in (src as object)) return String((src as { uri: unknown }).uri ?? '');
  return '';
}

function Photo({ uri, style }: { uri: string | null; style: object }) {
  if (!uri) return <View style={[style, { backgroundColor: m.img }]} />;
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

function Promise({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.promise}>
      <Icon icon={icon} size={14} color={m.goldDark} />
      <Text style={styles.promiseText}>{text}</Text>
    </View>
  );
}

function Line({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.line}>
      <Icon icon={icon} size={14} color={m.goldDark} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepN}>
        <Text style={styles.stepNText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={mType.bodyStrong}>{title}</Text>
        <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: mGutter, paddingTop: 18, paddingBottom: 8, gap: 14 },
  section: { paddingHorizontal: mGutter, paddingVertical: 28 },
  beige: { backgroundColor: m.beige },
  fill: { width: '100%', height: '100%' },
  mosaic: { flexDirection: 'row', gap: 4, paddingHorizontal: mGutter, paddingTop: 10 },
  mosaicBig: { borderRadius: mRadius.md, overflow: 'hidden', backgroundColor: m.img },
  mosaicCol: { flex: 1, gap: 4 },
  mosaicSquare: { flex: 1, borderRadius: mRadius.md, backgroundColor: m.img },
  mosaicPair: { flexDirection: 'row', gap: 4, flex: 1 },
  mosaicSmall: { flex: 1, borderRadius: mRadius.md, backgroundColor: m.img },
  h1Gold: { color: m.goldDark },
  sub: { marginTop: -4 },
  promises: { gap: 8, marginTop: 2 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promiseText: { fontSize: 13.5, color: m.body, ...mFont(400) },
  pill: { alignSelf: 'flex-start', backgroundColor: m.white, color: m.goldDark, fontSize: 12, paddingHorizontal: 10, height: 24, lineHeight: 24, borderRadius: 12, overflow: 'hidden', ...mFont(400) },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 13.5, color: m.body, ...mFont(400), flex: 1 },
  held: { fontSize: 12.5, color: m.goldDark, lineHeight: 16, ...mFont(400) },
  practice: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: m.lineWarm },
  practicePhoto: { width: 72, height: 72, borderRadius: mRadius.md, backgroundColor: m.img },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 16 },
  stepN: { width: 32, height: 32, borderRadius: 16, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: m.goldDark, fontSize: 14, ...mFont(500) },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cat: { borderRadius: mRadius.md, overflow: 'hidden', backgroundColor: m.img },
  catLabel: { position: 'absolute', left: 10, bottom: 10, backgroundColor: m.white, borderRadius: 14, paddingHorizontal: 12, height: 28, justifyContent: 'center' },
  catLabelText: { fontSize: 13, color: m.ink, ...mFont(500) },
  rail: { paddingHorizontal: mGutter, gap: 12 },
  giftBand: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: mRadius.lg, backgroundColor: m.beige },
  giftPhoto: { width: 88, height: 88, borderRadius: mRadius.md },
  giftText: { flex: 1 },
  chev: { fontSize: 22, color: m.goldDark, paddingHorizontal: 4 },
});
