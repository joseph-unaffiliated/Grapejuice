import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import type { MainStackParamList } from '../../navigation/types';
import { openBoxSurface } from '../../navigation/boxEntry';
import { usePreviewedHasStartedBox, usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import { useSession } from '../../hooks/useSession';
import { useBoxGlance, NOT_HELD_COPY } from '../../hooks/useBoxGlance';
import { useStorefrontLeave } from '../storefront/storefrontLeaveContext';
import { isStorefrontRavOpenable, useStorefrontRav } from '../storefront/storefrontRavContext';
import { isSocialInAppBrowser } from '../../utils/inAppBrowser';
import { requestLoginLink } from '../../services/auth/loginLinks';
import { useAuthStore } from '../../stores/authStore';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { BoxSummary } from './BoxSummary';
import { useCatalog } from '../../hooks/useCatalog';
import { primaryPhoto } from './catalogPhotos';
import { MobileButton } from './MobileButton';
import { m, mFont, mType, TAP } from './mobileTheme';

type Nav = StackNavigationProp<MainStackParamList>;
type Props = { visible: boolean; onClose: () => void };

/**
 * The phone menu from the mockups: your box first, then Shop (accordion), Send a gift,
 * Learn, You. Replaces StorefrontMobileNav when the mobile layouts are on.
 */
export function MobileMenuPanel({ visible, onClose }: Props) {
  if (!visible) return null;
  return <Panel onClose={onClose} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.classList.add('gj-menu-open');
    return () => document.body.classList.remove('gj-menu-open');
  }, []);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const leave = useStorefrontLeave();
  const { openRav } = useStorefrontRav();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasOwnBox = usePreviewedHasStartedBox();
  const { refresh } = useSession();
  const glance = useBoxGlance();
  const userEmail = useAuthStore((s) => s.user?.email ?? null);
  const [shopOpen, setShopOpen] = useState(false);
  const { items: catalog } = useCatalog();
  const catThumbs = useMemo(() => {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    return Object.fromEntries(Object.entries(CAT_THUMB_IDS).map(([slug, id]) => [slug, primaryPhoto(byId.get(id))]));
  }, [catalog]);
  const [linkSent, setLinkSent] = useState(false);

  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const goCategory = (slug: string) =>
    go(() => {
      if (leave) return leave({ type: 'category', slug });
      navigation.navigate('StorefrontCategory', { category: slug });
    });
  const startBox = () =>
    go(() => openBoxSurface(isAuthenticated, { leave: leave ? () => leave({ type: 'myBox' }) : undefined, hasOwnBox, refreshSession: refresh }));
  const goMyBox = () =>
    go(() => {
      if (leave) return leave({ type: 'myBox' });
      navigation.navigate('MyBox');
    });

  const sendLink = async () => {
    if (!userEmail) return;
    try {
      await requestLoginLink({ email: userEmail, next: '/box' });
      setLinkSent(true);
    } catch {
      setLinkSent(true);
    }
  };

  const thumbItems = glance.thumbs.map((t) => ({
    ...t,
    onPress: () => {
      if (glance.state === 'none') {
        go(() =>
          openBoxSurface(isAuthenticated, {
            hasOwnBox: false,
            refreshSession: refresh,
            pendingItemId: t.id,
            focusItemId: t.id,
          })
        );
        return;
      }
      useGuestSessionStore.getState().setMyBoxFocusItemId(t.id);
      goMyBox();
    },
  }));
  const boxCard =
    glance.state === 'none' ? (
      <BoxSummary size="sm" title="Build my box" sub="Hanukkah delivered to your door, from $80" items={thumbItems} onPress={startBox} link={<Chevron />} />
    ) : (
      <BoxSummary
        size="sm"
        title="My Box"
        sub={`${glance.state === 'set' ? `Set · ships after ${glance.lockShort}` : `Change anything until ${glance.lockShort}`} · ${glance.totalLabel}`}
        items={thumbItems}
        onPress={goMyBox}
        link={<Chevron />}
      >
        {glance.state === 'draft' ? <Text style={styles.held}>{NOT_HELD_COPY}</Text> : null}
      </BoxSummary>
    );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" style={styles.brandHit}>
            <GrapejuiceBrandMark markOnly width={24} height={24} color={m.ink} />
            <Text style={styles.headTitle}>Menu</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" style={styles.close} hitSlop={8}>
            <Icon icon={icons.close} size={18} color={m.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 140 + insets.bottom }]}>
          {boxCard}

          <Row label="Shop" chevron="⌄" onPress={() => setShopOpen((v) => !v)} open={shopOpen} />
          {shopOpen ? (
            <>
              <View style={styles.cats}>
                {STOREFRONT_CATEGORIES.filter((c) => c.slug !== 'collection' && c.slug !== 'other').map((c) => {
                  const thumb = catThumbs[c.slug];
                  return (
                    <Pressable key={c.slug} onPress={() => goCategory(c.slug)} accessibilityRole="button" style={styles.cat}>
                      {c.slug === 'on-sale' ? (
                        <View style={[styles.catThumb, styles.sale]}>
                          <Text style={styles.saleText}>%</Text>
                        </View>
                      ) : thumb ? (
                        <Image source={{ uri: thumb }} style={styles.catThumb} resizeMode="cover" />
                      ) : (
                        <View style={styles.catThumb} />
                      )}
                      <Text style={styles.catText} numberOfLines={1}>{c.label === 'On Sale' ? 'On sale' : c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => goCategory('collection')} accessibilityRole="button" style={styles.all}>
                <Text style={styles.allText}>Shop everything ›</Text>
              </Pressable>
            </>
          ) : null}

          <Row label="Send a gift" sub="A box for another family" onPress={() => go(() => (leave ? leave({ type: 'service', id: 'gift' }) : navigation.navigate('GiftLanding')))} />

          <Text style={styles.group}>Learn</Text>
          <Row label="How to light the candles" onPress={() => go(() => navigation.navigate('StorefrontHowToLightCandles'))} />
          <Row label="How to play dreidel" onPress={() => go(() => navigation.navigate('StorefrontHowToPlayDreidel'))} />
          <Row label="Our story" onPress={() => go(() => (leave ? leave({ type: 'service', id: 'story' }) : navigation.navigate('StorefrontOurStory')))} />

          <Text style={styles.group}>You</Text>
          <Row
            label={isAuthenticated || glance.state !== 'none' ? 'Account' : 'Sign in'}
            sub={isAuthenticated || glance.state !== 'none' ? 'Orders, family, payment' : 'We email you a code. No password needed.'}
            onPress={() => go(() => (leave ? leave({ type: 'screen', nav: { screen: 'MainTabs', tab: 'Account' } }) : navigation.navigate('MainTabs', { screen: 'Account' })))}
          />
          <Row
            label="Ask Rav"
            sub="Questions about your box or Hanukkah"
            lead={
              <View style={styles.ravIcon}>
                <Icon icon={icons.childReaching} size={16} color={m.ink} />
              </View>
            }
            onPress={() =>
              go(() => {
                if (isStorefrontRavOpenable()) return openRav();
                navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } });
              })
            }
          />
          <Row label="Email us" sub="hello@grapejuice.co" onPress={() => void Linking.openURL('mailto:hello@grapejuice.co')} />

          {isSocialInAppBrowser() && glance.hasBox && userEmail ? (
            <View style={styles.igCard}>
              <Text style={styles.igTitle}>Don't lose your box</Text>
              <Text style={styles.igText}>Instagram's browser can forget you. Email yourself a link so your box opens in Safari too.</Text>
              <MobileButton label={linkSent ? 'Link sent' : 'Email me a link'} onPress={sendLink} disabled={linkSent} height={44} />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Main (grey) photos for the Shop tiles, as in the mockup's menu. */
const CAT_THUMB_IDS: Record<string, string> = {
  menorahs: 'arch-menorah',
  candles: 'beeswax-candles',
  dreidels: 'classic-wooden-dreidel',
  gelt: 'big-bag-of-gelt',
  food: 'latke-kit',
  books: 'book-a-dragon-for-hanukkah',
  stuffies: 'shamash-the-menorah-stuffie',
  toys: 'lego-menorah',
  activity: 'airdry-clay-dreidel',
};

function Chevron() {
  return <Text style={styles.chev}>›</Text>;
}

function Row({ label, sub, onPress, chevron = '›', open, lead }: { label: string; sub?: string; onPress: () => void; chevron?: string; open?: boolean; lead?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={open != null ? { expanded: open } : undefined} style={styles.row}>
      {lead}
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {chevron ? <Text style={[styles.chev, open && { transform: [{ rotate: '180deg' }] }]}>{chevron}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m.white },
  head: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: m.line },
  brandHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  headTitle: { flex: 1, fontSize: 16, color: m.ink, ...mFont(500) },
  close: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  body: { padding: 16, gap: 0 },
  held: { ...mType.tiny, color: m.goldDark, lineHeight: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: m.line },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 17, letterSpacing: -0.2, color: m.ink, ...mFont(400) },
  rowSub: { fontSize: 13, color: m.muted, ...mFont(300) },
  chev: { fontSize: 20, color: m.goldDark, width: 20, textAlign: 'center' },
  group: { fontSize: 13, lineHeight: 18, color: m.muted, marginTop: 28, marginBottom: 2, ...mFont(400) },
  cats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, paddingTop: 12, paddingBottom: 8 },
  cat: { width: '48.8%', height: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: m.line },
  catThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: m.img },
  sale: { backgroundColor: m.beige, alignItems: 'center', justifyContent: 'center' },
  saleText: { fontSize: 15, color: m.goldDark, ...mFont(500) },
  catText: { flex: 1, fontSize: 14.5, color: m.ink, ...mFont(400) },
  ravIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center' },
  all: { width: '100%', height: TAP, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: m.line },
  allText: { fontSize: 14.5, color: m.goldDark, ...mFont(400) },
  igCard: { marginTop: 24, padding: 16, borderRadius: 14, backgroundColor: m.beige, gap: 8 },
  igTitle: { ...mType.h3 },
  igText: { ...mType.small, color: m.body, lineHeight: 19 },
});
