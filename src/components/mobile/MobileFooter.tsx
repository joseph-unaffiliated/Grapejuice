import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { isStorefrontRavOpenable, openStorefrontRav } from '../storefront/storefrontRavContext';
import type { MainStackParamList } from '../../navigation/types';
import { m, mFont, mGutter } from './mobileTheme';

type Nav = StackNavigationProp<MainStackParamList>;
type Link = { label: string; onPress: () => void };

/** The phone site footer: mark and tagline, then Shop, Company and Contact columns on ink. */
export function MobileFooter() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const category = (slug: string) => () => navigation.navigate('StorefrontCategory', { category: slug });
  const columns: { heading: string; links: Link[] }[] = [
    {
      heading: 'Shop',
      links: [
        { label: 'Shop all', onPress: category('collection') },
        { label: 'Menorahs', onPress: category('menorahs') },
        { label: 'Candles', onPress: category('candles') },
        { label: 'Stuffies', onPress: category('stuffies') },
        { label: 'Books', onPress: category('books') },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'Our story', onPress: () => navigation.navigate('StorefrontOurStory') },
        { label: 'Send a gift', onPress: () => navigation.navigate('GiftLanding') },
        { label: 'Account', onPress: () => navigation.navigate('MainTabs', { screen: 'Account' }) },
        { label: 'Terms', onPress: () => navigation.navigate('StorefrontTerms') },
        { label: 'Privacy', onPress: () => navigation.navigate('StorefrontPrivacy') },
      ],
    },
    {
      heading: 'Contact',
      links: [
        {
          label: 'Ask Rav',
          onPress: () => {
            if (isStorefrontRavOpenable()) return openStorefrontRav();
            navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } });
          },
        },
        { label: 'hello@grapejuice.co', onPress: () => void Linking.openURL('mailto:hello@grapejuice.co') },
        { label: 'Instagram', onPress: () => void Linking.openURL('https://www.instagram.com/grapejuice_co') },
      ],
    },
  ];
  return (
    <View style={[styles.root, { paddingBottom: 40 + insets.bottom }]} role="contentinfo">
      <View style={styles.top}>
        <GrapejuiceBrandMark markOnly width={24} height={24} color={m.gold} decorative />
        <Text style={styles.tagline}>Hanukkah, made easy.</Text>
      </View>
      <View style={styles.cols}>
        {columns.map((col) => (
          <View key={col.heading} style={styles.col}>
            <Text style={styles.heading}>{col.heading}</Text>
            {col.links.map((l) => (
              <Pressable key={l.label} onPress={l.onPress} accessibilityRole="link" hitSlop={4}>
                <Text style={styles.link} numberOfLines={1}>
                  {l.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: m.ink, paddingHorizontal: mGutter, paddingTop: 32 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  tagline: { fontSize: 15, color: m.white, ...mFont(400) },
  cols: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, gap: 10 },
  heading: { fontSize: 13.5, color: m.white, marginBottom: 2, ...mFont(500) },
  link: { fontSize: 13.5, color: '#C9C9C9', ...mFont(400) },
});
