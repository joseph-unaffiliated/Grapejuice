import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MobileButton } from '../../components/mobile/MobileButton';
import { m, mFont, mGutter, mRadius, mType, balanceProps } from '../../components/mobile/mobileTheme';

const HERO = require('../../../assets/storefront/menorahs-lifestyle-trio.jpg');

type Props = {
  year: number;
  /** Signed in and already on the Passover list. */
  notified: boolean;
  onNotify: () => void;
  onShop: () => void;
  onAccount: () => void;
};

/** Phone home once Hanukkah is over: boxes closed, the store stays open, Passover is next. */
export function MobileClosedHome({ year, notified, onNotify, onShop, onAccount }: Props) {
  return (
    <View>
      <Image source={HERO} style={styles.hero} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.pad}>
        <Text style={mType.h1} {...balanceProps}>Hanukkah boxes are closed for {year}</Text>
        <Text style={styles.body} {...balanceProps}>Thank you for celebrating with us. We hope your eight nights were bright.</Text>
      </View>
      <View style={styles.closed}>
        <Text style={styles.closedTitle}>Still need something?</Text>
        <Text style={styles.closedBody}>Candles, dreidels, gelt and gifts still ship on their own.</Text>
        <MobileButton label="Shop the store" onPress={onShop} height={50} style={{ marginTop: 12 }} />
      </View>
      <View style={styles.pad}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Passover is next</Text>
          <Text style={styles.closedBody}>{notified ? "You're on the list. We'll email you once when Passover boxes open." : 'Get one email when Passover boxes open.'}</Text>
          <MobileButton label={notified ? 'Stop the email' : 'Notify me'} variant={notified ? 'secondary' : 'primary'} onPress={onNotify} height={44} style={{ marginTop: 12 }} />
        </View>
        <Pressable onPress={onAccount} accessibilityRole="button" style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Already ordered?</Text>
            <Text style={styles.rowSub}>Track your box in your account</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>
      <View style={{ height: 30 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 240, backgroundColor: m.img },
  pad: { paddingHorizontal: mGutter, paddingTop: 22 },
  body: { fontSize: 16, lineHeight: 25, color: m.body, marginTop: 10, ...mFont(300) },
  closed: { marginHorizontal: mGutter, marginTop: 18, padding: 18, borderRadius: mRadius.md, backgroundColor: m.beige },
  closedTitle: { fontSize: 17, color: m.ink, ...mFont(500) },
  closedBody: { fontSize: 14.5, lineHeight: 21, color: m.body, marginTop: 4, ...mFont(300) },
  card: { padding: 18, borderRadius: mRadius.md, borderWidth: 1, borderColor: m.lineWarm },
  cardTitle: { fontSize: 17, color: m.ink, ...mFont(500) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, marginTop: 10, borderBottomWidth: 1, borderBottomColor: m.line },
  rowTitle: { fontSize: 16, color: m.ink, ...mFont(400) },
  rowSub: { fontSize: 13.5, color: m.muted, marginTop: 2, ...mFont(400) },
  chev: { fontSize: 20, color: m.goldDark },
});
