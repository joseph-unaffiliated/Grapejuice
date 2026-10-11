import React, { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { availabilityRemaining } from '../../services/catalog/availability';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { ProductTileMobile } from '../../components/mobile/ProductTileMobile';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { BoxPitch } from '../../components/mobile/BoxPitch';
import { balanceProps, m, mFont, mGutter, mRadius, mType } from '../../components/mobile/mobileTheme';

export type RoleOption = {
  key: string;
  title: string;
  detail: string;
  /** "Included" or "+$15". */
  price: string;
  onPress: () => void | Promise<void>;
};

type Props = {
  item: CatalogItem;
  categoryLabel?: string;
  availability?: CatalogAvailability;
  priceCents: number;
  memberCents: number;
  details: { label: string; value: string }[];
  similar: CatalogItem[];
  similarTitle: string;
  hasBox: boolean;
  inBox: boolean;
  inBoxUnitCents: number;
  boxQuantity: number;
  kidNameForGift?: string | null;
  locked: boolean;
  saving: boolean;
  soldOut: boolean;
  /** Options for the role chooser; empty means plain "Add to my box". */
  roleOptions: RoleOption[];
  wishlisted: boolean;
  onToggleWishlist: () => void;
  onOpenProduct: (slug: string) => void;
  onViewBox: () => void;
  onQuantity: (delta: 1 | -1) => void;
  onBuyJustThis?: () => void;
  onStartBoxWithIt: () => void;
  onNotifyBack?: () => void;
  backLabel?: string;
  onBack?: () => void;
  /** Toast after an add. */
  lastAdded?: string | null;
};

/** Product page for the phone layouts (mockups store.html S3-S8, S12). The screen keeps the logic; this renders it. */
export function MobileProductBody(p: Props) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [chooser, setChooser] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const photos = useMemo(() => (p.item.imageUrls?.length ? p.item.imageUrls : p.item.imageUrl ? [p.item.imageUrl] : []), [p.item]);
  const remaining = p.availability ? availabilityRemaining(p.availability) : null;
  const low = !p.soldOut && remaining != null && remaining > 0 && remaining <= 12;
  const desc = (p.item.description ?? '').trim();
  const shortDesc = desc.length > 160 && !more ? `${desc.slice(0, 157).trimEnd()}…` : desc;

  const bar = p.soldOut ? (
    <StickyBar label="Sold out" total={p.onNotifyBack ? 'We can email you if it comes back' : ''} layout="row" cta={{ label: 'Email me if it’s back', onPress: p.onNotifyBack ?? (() => {}), variant: 'secondary', disabled: !p.onNotifyBack }} />
  ) : p.inBox ? (
    <StickyBar label={p.inBoxUnitCents > 0 ? `Added${p.kidNameForGift ? ` for ${p.kidNameForGift}` : ''}` : 'In your box'} total={p.inBoxUnitCents > 0 ? `+${formatCatalogDollars(p.inBoxUnitCents * p.boxQuantity)}` : 'Included'} cta={{ label: 'View my box', onPress: p.onViewBox, variant: 'secondary' }} />
  ) : p.hasBox ? (
    <StickyBar label="Add to your box" total={p.memberCents > 0 ? formatCatalogDollars(p.memberCents) : 'Included'} cta={{ label: 'Add to my box', onPress: () => (p.roleOptions.length > 1 ? setChooser(true) : void p.roleOptions[0]?.onPress()), disabled: p.locked || p.saving, busy: p.saving }} />
  ) : (
    <StickyBar label="On its own" total={formatCatalogDollars(p.priceCents)} cta={{ label: 'Buy just this', onPress: p.onBuyJustThis ?? (() => {}), variant: 'secondary', disabled: !p.onBuyJustThis || p.saving }} />
  );

  return (
    <View style={{ paddingBottom: STICKY_BAR_CLEARANCE }}>
      {p.onBack ? (
        <Pressable onPress={p.onBack} accessibilityRole="button" style={styles.back} hitSlop={8}>
          <Text style={styles.backText}>‹ {p.backLabel ?? 'Back'}</Text>
        </Pressable>
      ) : null}

      <View style={styles.gallery}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={64}
        >
          {photos.map((uri, i) => (
            <Image key={uri} source={{ uri }} style={{ width, height: width, backgroundColor: m.img }} resizeMode="cover" accessibilityLabel={i === 0 ? p.item.name : undefined} />
          ))}
        </ScrollView>
        {p.inBox ? (
          <View style={styles.inBoxTag}>
            <Text style={styles.inBoxTagText}>✓ In your box</Text>
          </View>
        ) : null}
        <Pressable onPress={p.onToggleWishlist} accessibilityRole="button" accessibilityLabel={p.wishlisted ? 'Remove from favorites' : 'Save to favorites'} style={styles.heart} hitSlop={10}>
          <Icon icon={p.wishlisted ? icons.heart : icons.heartOutline} size={22} color={m.white} />
        </Pressable>
        {photos.length > 1 ? (
          <View style={styles.dots}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.pad}>
        {p.categoryLabel ? <Text style={mType.eyebrow}>{p.categoryLabel}</Text> : null}
        <Text style={[mType.h1, { marginTop: 4 }]} {...balanceProps}>
          {p.item.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatCatalogDollars(p.priceCents)}</Text>
          {p.hasBox && p.memberCents > 0 && p.memberCents < p.priceCents ? <Text style={styles.member}>{formatCatalogDollars(p.memberCents)} in your box</Text> : null}
          {low ? <Text style={styles.low}>Low stock · {remaining} left</Text> : null}
          {p.soldOut ? <Text style={styles.low}>Sold out</Text> : null}
        </View>
        {desc ? (
          <Text style={[mType.body, { marginTop: 12 }]}>
            {shortDesc}
            {desc.length > 160 && !more ? (
              <Text style={styles.moreLink} onPress={() => setMore(true)}>
                {' '}
                More
              </Text>
            ) : null}
          </Text>
        ) : null}

        {p.inBox ? (
          <View style={styles.inBoxCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inBoxTitle}>✓ In your box</Text>
              <Text style={styles.inBoxSub}>{p.inBoxUnitCents > 0 ? `Added${p.kidNameForGift ? ` for ${p.kidNameForGift}` : ''} · ${formatCatalogDollars(p.inBoxUnitCents)} each` : `Included${p.kidNameForGift ? ` for ${p.kidNameForGift}` : ''}`}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => p.onQuantity(-1)} disabled={p.locked} accessibilityRole="button" accessibilityLabel={p.boxQuantity <= 1 ? (p.inBoxUnitCents === 0 ? 'Donate' : 'Remove') : 'Decrease quantity'} style={styles.stepBtn}>
                <Text style={styles.stepText}>{p.boxQuantity <= 1 && p.inBoxUnitCents === 0 ? '♡' : '−'}</Text>
              </Pressable>
              <Text style={styles.stepQty}>{p.boxQuantity}</Text>
              <Pressable onPress={() => p.onQuantity(1)} disabled={p.locked} accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.stepBtn}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!p.hasBox && !p.soldOut ? (
          <View style={{ marginTop: 20, marginHorizontal: -mGutter }}>
            <BoxPitch items={[p.item]} cta="Start a box with it" onPress={p.onStartBoxWithIt} />
          </View>
        ) : null}
      </View>

      {p.details.length ? (
        <View style={[styles.pad, { paddingTop: 20 }]}>
          {p.details.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text style={styles.detailLabel}>{d.label}</Text>
              <Text style={styles.detailValue}>{d.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {p.similar.length ? (
        <View style={{ paddingTop: 28 }}>
          <Text style={[mType.h2, { paddingHorizontal: mGutter }]}>{p.similarTitle}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {p.similar.slice(0, 8).map((it) => (
              <ProductTileMobile key={it.id} item={it} width={150} onPress={() => p.onOpenProduct(it.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {bar}

      <MobileSheet visible={chooser} onClose={() => setChooser(false)} title="How should it join your box?">
        {p.roleOptions.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => {
              setChooser(false);
              void o.onPress();
            }}
            accessibilityRole="button"
            style={styles.role}
          >
            <View style={{ flex: 1 }}>
              <Text style={mType.bodyStrong}>{o.title}</Text>
              <Text style={[mType.small, { color: m.body, marginTop: 2 }]}>{o.detail}</Text>
            </View>
            <Text style={styles.rolePrice}>{o.price}</Text>
          </Pressable>
        ))}
        <MobileButton label="Cancel" variant="secondary" onPress={() => setChooser(false)} style={{ marginTop: 8 }} height={46} />
      </MobileSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { height: 44, justifyContent: 'center', paddingHorizontal: mGutter },
  backText: { fontSize: 14, color: m.goldDark, ...mFont(400) },
  gallery: { position: 'relative', backgroundColor: m.img },
  heart: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  inBoxTag: { position: 'absolute', top: 12, left: 12, backgroundColor: m.gold, borderRadius: 14, paddingHorizontal: 10, height: 28, justifyContent: 'center' },
  inBoxTagText: { fontSize: 12.5, color: m.ink, ...mFont(500) },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(17,24,39,0.25)' },
  dotOn: { backgroundColor: m.ink },
  pad: { paddingHorizontal: mGutter, paddingTop: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  price: { fontSize: 18, color: m.ink, ...mFont(400) },
  member: { fontSize: 13, color: m.goldDark, ...mFont(400) },
  low: { fontSize: 12.5, color: m.warn, ...mFont(400) },
  moreLink: { color: m.goldDark, textDecorationLine: 'underline' },
  inBoxCard: { marginTop: 18, padding: 14, borderRadius: mRadius.md, backgroundColor: m.beige, borderWidth: 1.5, borderColor: m.gold, flexDirection: 'row', alignItems: 'center', gap: 12 },
  inBoxTitle: { fontSize: 14.5, color: m.ink, ...mFont(500) },
  inBoxSub: { fontSize: 12.5, color: m.goldDark, marginTop: 2, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 18, height: 36, backgroundColor: m.white },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark },
  stepQty: { minWidth: 18, textAlign: 'center', fontSize: 14, color: m.ink, ...mFont(500) },
  detail: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: m.line },
  detailLabel: { width: 110, fontSize: 13, color: m.muted, ...mFont(400) },
  detailValue: { flex: 1, fontSize: 14, color: m.ink, lineHeight: 20, ...mFont(400) },
  rail: { paddingHorizontal: mGutter, gap: 12, paddingTop: 14 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  rolePrice: { fontSize: 14.5, color: m.ink, ...mFont(500) },
});
