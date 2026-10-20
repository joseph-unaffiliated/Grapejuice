import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ProductTileMobile, stockStatus } from '../../components/mobile/ProductTileMobile';
import { MobileButton } from '../../components/mobile/MobileButton';
import { BrandLoadingMark } from '../../components/brand/BrandLoadingMark';
import { m, mFont, mGutter, mType, balanceProps } from '../../components/mobile/mobileTheme';
import { MobileFooter, MobileFooterSpacer, mobileFooterScrollStyle } from '../../components/mobile/MobileFooter';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';

type Props = {
  items: CatalogItem[];
  loading: boolean;
  signedIn: boolean;
  hasBox: boolean;
  boxIds: Set<string>;
  availabilityById: Record<string, CatalogAvailability>;
  onOpen: (slug: string) => void;
  onViewBox: () => void;
  onBrowse: () => void;
};

/** Phone favorites (mockups/store s=7): the category page's tiles for everything you've hearted. */
export function MobileFavoritesBody(p: Props) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - mGutter * 2 - 12) / 2);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: m.white }} contentContainerStyle={mobileFooterScrollStyle}>
      <View style={styles.content}>
      <Text style={styles.h1}>Favorites</Text>
      <Text style={styles.sub} {...balanceProps}>
        {p.signedIn ? 'Saved to your account.' : 'Saved on this phone. Sign in to keep them everywhere.'}
      </Text>
      {p.loading ? (
        <View style={styles.loading}><BrandLoadingMark /></View>
      ) : p.items.length === 0 ? (
        <View style={{ marginTop: 18, gap: 16 }}>
          <Text style={mType.body} {...balanceProps}>Tap the heart on anything in the store to save it here.</Text>
          <MobileButton label="Browse the store" onPress={p.onBrowse} />
        </View>
      ) : (
        <>
          <Text style={styles.count}>{p.items.length} {p.items.length === 1 ? 'item' : 'items'}</Text>
          <View style={styles.grid}>
            {p.items.map((it) => {
              const inBox = p.boxIds.has(it.id);
              const status = inBox ? ({ kind: 'inbox' } as const) : stockStatus(p.availabilityById[it.id], it);
              return (
                <ProductTileMobile
                  key={it.id}
                  item={it}
                  width={tile}
                  status={status}
                  onPress={() => p.onOpen(it.id)}
                  action={
                    inBox
                      ? { label: 'View my box', onPress: p.onViewBox, variant: 'secondary' }
                      : p.hasBox && status?.kind !== 'sold'
                        ? { label: 'Add to my box', onPress: () => p.onOpen(it.id), variant: 'secondary' }
                        : undefined
                  }
                  style={{ marginBottom: 8 }}
                />
              );
            })}
          </View>
        </>
      )}
      </View>
      <MobileFooterSpacer />
      <MobileFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: mGutter, paddingTop: 22, paddingBottom: 8 },
  h1: { fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: m.ink, ...mFont(400) },
  sub: { fontSize: 14, lineHeight: 20, color: m.muted, marginTop: 6, ...mFont(300) },
  count: { fontSize: 13, color: m.muted, marginTop: 16, marginBottom: 12, ...mFont(400) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  loading: { paddingVertical: 60, alignItems: 'center' },
});
