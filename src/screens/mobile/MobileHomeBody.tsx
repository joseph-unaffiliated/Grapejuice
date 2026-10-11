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
import { ProductTileMobile, stockStatus } from '../../components/mobile/ProductTileMobile';
import { useCatalogAvailabilityMap } from '../../hooks/useCatalogAvailabilityMap';
import { StickyBar } from '../../components/mobile/StickyBar';
import { byId, homePhoto, TOP_PICK_IDS } from '../../components/mobile/catalogPhotos';
import { balanceProps, m, mFont, mGutter, mType } from '../../components/mobile/mobileTheme';
import { isStorefrontRavOpenable, useStorefrontRav } from '../../components/storefront/storefrontRavContext';
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

const PRACTICES: Record<string, { title: string; line: string }> = {
  candles: { title: 'Light the Candles', line: 'One more candle each night, plus the shamash.' },
  dreidel: { title: 'Play Dreidel', line: 'One dreidel per person, and gelt to play for.' },
  food: { title: 'Eat & Drink', line: 'Latkes and sufganiyot, fried at home.' },
  story: { title: 'Tell the Story', line: 'A book to read together, picked for their age.' },
  presents: { title: 'Gifts for each kid', line: 'One present for each kid, wrapped or ready to wrap.' },
};

/**
 * The phone homepage from the mockups: an edge-to-edge photo mosaic with the banner reel,
 * one line with the price, "Build my box", the three promises, "Eight nights, one box",
 * how it works, shop by category, top picks, the gift band, our story and Ask Rav.
 * Returning visitors see their box card instead and skip straight to shopping.
 * Rendered inside StorefrontChrome (site header and footer).
 */
export function MobileHomeBody({ items, startBox, goCategory, goCheckout, goMyBox, goGift, startsOn }: Props) {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const glance = useBoxGlance();
  const { openRav } = useStorefrontRav();
  const { byId: availability } = useCatalogAvailabilityMap();
  const photos = useMemo(() => byId(items), [items]);
  const heroRef = useRef<View>(null);
  const [heroGone, setHeroGone] = useState(false);
  const endRef = useRef<View>(null);
  const [atEnd, setAtEnd] = useState(false);
  const inner = width - mGutter * 2;
  const isNew = glance.state === 'none';

  // The sticky "Build my box" bar shows between the hero and the gift band, so it never covers the footer.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    const hero = heroRef.current as unknown as Element | null;
    const end = endRef.current as unknown as Element | null;
    if (!hero) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setHeroGone(!e.isIntersecting);
        else setAtEnd(e.isIntersecting || e.boundingClientRect.top < 0);
      }
    }, { threshold: 0 });
    io.observe(hero);
    if (end) io.observe(end);
    return () => io.disconnect();
  }, [glance.state]);
  const showBar = isNew && heroGone && !atEnd;

  const firstNight = useMemo(() => {
    if (!startsOn) return null;
    return new Date(startsOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  }, [startsOn]);
  const beforeHanukkah = getHanukkahStatus(startsOn).phase === 'before';

  const topPicks = TOP_PICK_IDS.map((id) => photos.get(id)).filter((x): x is CatalogItem => !!x);
  const openProduct = (slug: string) => navigation.navigate('CatalogProduct', { slug });
  const askRav = () => {
    if (isStorefrontRavOpenable()) return openRav();
    navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } });
  };

  const bigW = Math.round(((width - 4) * 1.25) / 2.25);
  const hero = isNew ? (
    <View ref={heroRef} collapsable={false}>
      <View style={styles.mosaic}>
        <View style={[styles.mosaicBig, { width: bigW }]}>
          <StorefrontWebVideo src={resolveUri(STOREFRONT_HERO.src)} poster={STOREFRONT_HERO.poster} style={styles.fill} load="eager" />
        </View>
        <View style={styles.mosaicCol}>
          <Photo uri={homePhoto(photos, 'mosaicLatkes')} style={styles.mosaicCell} />
          <View style={styles.mosaicPair}>
            <Photo uri={homePhoto(photos, 'mosaicDrawing')} style={styles.mosaicCell} />
            <Photo uri={homePhoto(photos, 'mosaicGimmel')} style={styles.mosaicCell} />
          </View>
        </View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.heroH1} {...balanceProps}>
          Hanukkah, delivered to your door. <Text style={styles.h1Gold}>One box, $80.</Text>
        </Text>
        <Text style={styles.lede} {...balanceProps}>
          Candles, dreidels, gelt, food kits, a book and a present for each kid. Picked for your family, delivered before {beforeHanukkah && firstNight ? firstNight : 'the first night'}.
        </Text>
        <MobileButton label="Build my box" onPress={startBox} height={54} />
        <View style={styles.trust}>
          <Trust icon={icons.truck} text="Free shipping" />
          <Trust icon={icons.pen} text={`Change anything until ${glance.lockShort}`} />
          <Trust icon={icons.card} text="Charged when it ships" />
        </View>
      </View>
    </View>
  ) : (
    <View ref={heroRef} collapsable={false}>
      <View style={styles.welcome}>
        <Text style={[mType.eyebrow, { marginBottom: 6 }]}>Welcome back</Text>
        <Text style={mType.h1}>{glance.state === 'set' ? 'Your box is set' : 'Your box is waiting'}</Text>
      </View>
      <View style={{ paddingHorizontal: mGutter, marginTop: 12 }}>
      <BoxSummary total={glance.totalLabel} items={glance.thumbs}>
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
        <MobileButton label={glance.state === 'set' ? 'View my box' : 'Add shipping and payment'} onPress={glance.state === 'set' ? goMyBox : goCheckout} height={54} />
        <MobileButton label={glance.state === 'set' ? 'Shop extras' : 'Keep editing'} onPress={glance.state === 'set' ? () => goCategory('collection') : goMyBox} variant="secondary" height={54} />
      </BoxSummary>
      </View>
      <View style={{ height: 4 }} />
    </View>
  );

  return (
    <View>
      {hero}

      {isNew ? (
        <>
          <View style={styles.band}>
            <View style={styles.pad}>
              <Text style={styles.bandH2}>Eight nights, one box</Text>
              <Text style={[styles.lede, { fontSize: 14.5, marginTop: 8, marginBottom: 18 }]} {...balanceProps}>Picked for your kids' ages and how your family celebrates. Swap anything you like.</Text>
            </View>
            <View style={styles.plist}>
              {BOX_DISPLAY_SECTIONS.map((sec) => (
                <View key={sec.id} style={styles.practice}>
                  <Photo uri={homePhoto(photos, practicePhotoKey(sec.id))} style={styles.practicePhoto} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.practiceTitle}>{PRACTICES[sec.id]?.title ?? sec.title}</Text>
                    <Text style={styles.practiceLine} {...balanceProps}>{PRACTICES[sec.id]?.line}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={[styles.pad, { marginTop: 22 }]}>
              <MobileButton label="Build my box · from $80" onPress={startBox} height={54} />
            </View>
          </View>

          <View style={[styles.band, styles.cream]}>
            <Text style={[styles.bandH2, styles.pad, { marginBottom: 18 }]}>How it works</Text>
            <View style={styles.steps}>
              <Step n="1" title="Tell us about your family" text="Kids' ages and how you usually celebrate. Two minutes." />
              <Step n="2" title="We pick everything" text="Candles, dreidels, gelt, food kits, a book and a present for each kid." />
              <Step n="3" title={`Swap anything until ${glance.lockShort}`} text="Your card is charged when it ships, in time for the first night." />
            </View>
          </View>
        </>
      ) : null}

      <View style={styles.band}>
        <SectionHead title="Shop by category" link="Shop all" onPress={() => goCategory('collection')} />
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
            <Pressable key={slug} onPress={() => goCategory(slug)} accessibilityRole="button" accessibilityLabel={label} style={[styles.cat, { width: (inner - 10) / 2, height: (inner - 10) / 2 / 1.15 }]}>
              <Photo uri={homePhoto(photos, key)} style={styles.fill} />
              <View style={styles.catLabel}>
                <Text style={styles.catLabelText}>{label}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {topPicks.length ? (
        <View style={[styles.band, { paddingTop: 8 }]}>
          <SectionHead title="Top picks" link="See all" onPress={() => goCategory('collection')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {topPicks.map((it) => (
              <ProductTileMobile key={it.id} item={it} width={150} status={stockStatus(availability[it.id])} onPress={() => openProduct(it.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View ref={endRef} collapsable={false} style={[styles.band, { paddingTop: 12 }]}>
        <View style={styles.giftBand}>
          <Image source={DOORSTEP} style={styles.giftPhoto} resizeMode="cover" />
          <View style={styles.giftPad}>
            <Text style={styles.bandH2} {...balanceProps}>Send a box to another family</Text>
            <Text style={[styles.sub, { fontSize: 14.5 }]} {...balanceProps}>Pick what goes in, or send credit and let them choose.</Text>
            <MobileButton label="Send a gift" onPress={goGift} height={48} style={{ marginTop: 8 }} />
          </View>
        </View>
      </View>

      <View style={[styles.band, { paddingTop: 8 }]}>
        <View style={styles.story}>
          <Text style={mType.eyebrow}>Our story</Text>
          <Text style={styles.quote} {...balanceProps}>Making it your own doesn't mean doing it alone.</Text>
          <Text style={[styles.lede, { fontSize: 14.5 }]}>We started Grapejuice so every family can celebrate Hanukkah their way, without the homework.</Text>
          <Pressable onPress={() => navigation.navigate('StorefrontOurStory')} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <Text style={styles.link}>Read our story</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ paddingBottom: 36 }}>
        <Pressable onPress={askRav} accessibilityRole="button" style={styles.ask}>
          <View style={styles.askIcon}>
            <Icon icon={icons.childReaching} size={17} color={m.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.askTitle}>Questions? Ask Rav</Text>
            <Text style={styles.askSub}>What candles do we need? Can I swap the book?</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>

      {showBar ? (
        <StickyBar label="Everything for eight nights" total="From $80" cta={{ label: 'Build my box', onPress: startBox }} testID="mobile-home-bar" />
      ) : null}
    </View>
  );
}

function SectionHead({ title, link, onPress }: { title: string; link: string; onPress: () => void }) {
  return (
    <View style={styles.secRow}>
      <Text style={styles.bandH2}>{title}</Text>
      <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.link}>{link}</Text>
      </Pressable>
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

function Trust({ icon, text }: { icon: (typeof icons)[keyof typeof icons]; text: string }) {
  return (
    <View style={styles.trustRow}>
      <Icon icon={icon} size={16} color={m.goldDark} />
      <Text style={styles.trustText}>{text}</Text>
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
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: mGutter },
  band: { paddingVertical: 36 },
  cream: { backgroundColor: m.beige },
  bandH2: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.ink, ...mFont(500) },
  lede: { fontSize: 15.5, lineHeight: 23, color: m.body, ...mFont(300) },
  sub: { fontSize: 14, lineHeight: 20, color: m.muted, ...mFont(300) },
  link: { fontSize: 13, color: m.goldDark, textDecorationLine: 'underline', ...mFont(400) },
  fill: { width: '100%', height: '100%' },
  mosaic: { flexDirection: 'row', gap: 4, height: 304 },
  mosaicBig: { height: '100%', overflow: 'hidden', backgroundColor: m.img },
  mosaicCol: { flex: 1, gap: 4 },
  mosaicPair: { flexDirection: 'row', gap: 4, flex: 1 },
  mosaicCell: { flex: 1, backgroundColor: m.img },
  hero: { paddingHorizontal: mGutter, paddingTop: 22, paddingBottom: 26, gap: 12 },
  heroH1: { fontSize: 32, lineHeight: 36, letterSpacing: -1, color: m.ink, ...mFont(400) },
  h1Gold: { color: m.goldDark },
  trust: { gap: 8, marginTop: 8 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trustText: { fontSize: 13.5, color: m.body, ...mFont(400) },
  welcome: { paddingHorizontal: mGutter, paddingTop: 22, paddingBottom: 8 },
  pill: { alignSelf: 'flex-start', backgroundColor: m.white, color: m.goldDark, fontSize: 12, paddingHorizontal: 10, height: 24, lineHeight: 24, borderRadius: 12, overflow: 'hidden', ...mFont(400) },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 13.5, color: m.body, ...mFont(400), flex: 1 },
  held: { fontSize: 12.5, color: m.goldDark, lineHeight: 16, ...mFont(400) },
  plist: { paddingHorizontal: mGutter, gap: 12 },
  practice: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  practicePhoto: { width: 112, height: 112, borderRadius: 14, backgroundColor: m.img },
  practiceTitle: { fontSize: 16.5, lineHeight: 21, letterSpacing: -0.2, color: m.ink, ...mFont(500) },
  practiceLine: { fontSize: 13.5, lineHeight: 19, color: m.muted, ...mFont(300) },
  steps: { paddingHorizontal: mGutter, gap: 18 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepN: { width: 32, height: 32, borderRadius: 16, backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: m.goldDark, fontSize: 15, ...mFont(500) },
  stepTitle: { fontSize: 16, lineHeight: 21, color: m.ink, ...mFont(500) },
  stepText: { fontSize: 14, lineHeight: 20, color: m.muted, ...mFont(300) },
  secRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: mGutter, marginBottom: 14 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: mGutter },
  cat: { borderRadius: 14, overflow: 'hidden', backgroundColor: m.img },
  catLabel: { position: 'absolute', left: 10, bottom: 10, backgroundColor: m.white, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 5 },
  catLabelText: { fontSize: 13.5, lineHeight: 17, color: m.ink, ...mFont(400) },
  rail: { paddingHorizontal: mGutter, gap: 12, paddingBottom: 4 },
  giftBand: { marginHorizontal: mGutter, borderRadius: 16, overflow: 'hidden', backgroundColor: m.beige },
  giftPhoto: { width: '100%', height: 170 },
  giftPad: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20, gap: 8 },
  story: { paddingHorizontal: mGutter, gap: 10 },
  quote: { fontSize: 24, lineHeight: 29, letterSpacing: -0.6, color: m.ink, ...mFont(400) },
  ask: { marginHorizontal: mGutter, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: m.line, borderRadius: 14 },
  askIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center' },
  askTitle: { fontSize: 15.5, lineHeight: 20, color: m.ink, ...mFont(500) },
  askSub: { fontSize: 13, lineHeight: 18, color: m.muted, ...mFont(400) },
  chev: { fontSize: 20, color: m.goldDark, width: 20, textAlign: 'center' },
});
