import React, { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { availabilityRemaining } from '../../services/catalog/availability';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { ProductTileMobile, stockStatus } from '../../components/mobile/ProductTileMobile';
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
  /** Opens the product's category ("See all" beside the similar rail). */
  onSeeAll?: () => void;
  availabilityById?: Record<string, CatalogAvailability>;
  /** Toast after an add. */
  lastAdded?: string | null;
};

/** Product page for the phone layouts (mockups store.html S3-S8, S12). The screen keeps the logic; this renders it. */
export function MobileProductBody(p: Props) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [detail, setDetail] = useState<{ label: string; value: string } | null>(null);
  const imageH = Math.round((width * 6) / 7);
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
            <Image key={uri} source={{ uri }} style={{ width, height: imageH, backgroundColor: m.img }} resizeMode="cover" accessibilityLabel={i === 0 ? p.item.name : undefined} />
          ))}
        </ScrollView>
        <Pressable onPress={p.onToggleWishlist} accessibilityRole="button" accessibilityLabel={p.wishlisted ? 'Remove from favorites' : 'Save to favorites'} style={styles.heart} hitSlop={10}>
          <Icon icon={p.wishlisted ? icons.heart : icons.heartOutline} size={24} color={m.white} />
        </Pressable>
      </View>
      {photos.length > 1 ? (
        <View style={styles.dots}>
          {photos.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
      ) : null}

      <View style={styles.pad}>
        {p.categoryLabel ? <Text style={mType.eyebrow}>{p.categoryLabel}</Text> : null}
        <Text style={[mType.h1, { fontSize: 27, lineHeight: 31 }]} {...balanceProps}>
          {p.item.name}
        </Text>
        <View style={styles.priceRow}>
          {p.soldOut ? (
            <Text style={styles.soldPill}>Sold out</Text>
          ) : (
            <Text style={styles.price}>{formatCatalogDollars(p.priceCents)}</Text>
          )}
          {!p.soldOut && p.hasBox && p.memberCents > 0 && p.memberCents < p.priceCents ? <Text style={styles.member}>{formatCatalogDollars(p.memberCents)} in your box</Text> : null}
          {low ? (
            <View style={styles.corner}>
              <Text style={styles.cornerText}>Low stock</Text>
            </View>
          ) : null}
        </View>
        {desc ? (
          <Text style={styles.desc}>
            {shortDesc}
            {desc.length > 160 && !more ? (
              <Text style={styles.moreLink} onPress={() => setMore(true)}>
                {' '}
                More
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>

      {p.inBox ? (
          <View style={styles.inBoxCard}>
            <View style={{ flex: 1 }}>
              <View style={styles.inBoxTitleRow}>
                <Icon icon={icons.check} size={12} color={m.goldDark} />
                <Text style={styles.inBoxTitle}>{p.inBoxUnitCents > 0 ? `Added${p.kidNameForGift ? ` for ${p.kidNameForGift}` : ''}` : 'In your box'}</Text>
              </View>
              <Text style={styles.inBoxSub}>{p.inBoxUnitCents > 0 ? `On top of everything in your box · ${formatCatalogDollars(p.inBoxUnitCents)}` : p.kidNameForGift ? `Included as ${p.kidNameForGift}'s present` : 'Included'}</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => p.onQuantity(-1)} disabled={p.locked} accessibilityRole="button" accessibilityLabel={p.boxQuantity <= 1 ? (p.inBoxUnitCents === 0 ? 'Donate' : 'Remove') : 'Decrease quantity'} style={styles.stepBtn}>
                {p.boxQuantity <= 1 && p.inBoxUnitCents === 0 ? <Icon icon={icons.donate} size={16} color={m.goldDark} /> : <Text style={styles.stepText}>−</Text>}
              </Pressable>
              <Text style={styles.stepQty}>{p.boxQuantity}</Text>
              <Pressable onPress={() => p.onQuantity(1)} disabled={p.locked} accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.stepBtn}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

      {!p.hasBox && !p.soldOut ? (
        <View style={{ marginTop: 20 }}>
          <BoxPitch items={[p.item]} cta="Start a box with it" onPress={p.onStartBoxWithIt} />
        </View>
      ) : null}

      <View style={styles.details}>
        {[...p.details, { label: 'Shipping', value: p.hasBox ? 'Ships with your box, free' : 'Free shipping in the U.S.' }].map((d) => (
          <Pressable key={d.label} onPress={() => setDetail(d)} accessibilityRole="button" style={styles.listRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.listT}>{d.label}</Text>
              <Text style={styles.listS} numberOfLines={1}>
                {d.value.split('\n')[0]}
              </Text>
            </View>
            <Text style={styles.listC}>›</Text>
          </Pressable>
        ))}
      </View>

      {p.similar.length ? (
        <View style={{ paddingTop: 36, paddingBottom: 8 }}>
          <View style={styles.secRow}>
            <Text style={styles.secH2}>{p.similarTitle}</Text>
            {p.onSeeAll ? (
              <Pressable onPress={p.onSeeAll} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.moreLink}>See all</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {p.similar.slice(0, 8).map((it) => (
              <ProductTileMobile key={it.id} item={it} width={150} status={stockStatus(p.availabilityById?.[it.id])} onPress={() => p.onOpenProduct(it.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={{ height: 40 }} />

      {bar}

      <MobileSheet visible={detail != null} onClose={() => setDetail(null)} title={detail?.label ?? ''}>
        <Text style={styles.desc}>{detail?.value}</Text>
      </MobileSheet>

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
  gallery: { position: 'relative', backgroundColor: m.white },
  heart: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D1D5DB' },
  dotOn: { backgroundColor: m.ink },
  pad: { paddingHorizontal: mGutter, paddingTop: 18, gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { fontSize: 18, color: m.ink, ...mFont(400) },
  member: { fontSize: 13, color: m.goldDark, ...mFont(400) },
  corner: { backgroundColor: m.white, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  cornerText: { fontSize: 10.5, lineHeight: 13, color: m.ink, ...mFont(500) },
  soldPill: { height: 24, lineHeight: 24, paddingHorizontal: 10, borderRadius: 12, overflow: 'hidden', fontSize: 12, color: '#9A4D16', backgroundColor: m.warnBg, ...mFont(400) },
  desc: { fontSize: 15, lineHeight: 23, color: m.body, ...mFont(300) },
  moreLink: { color: m.goldDark, fontSize: 14, textDecorationLine: 'underline', ...mFont(400) },
  inBoxCard: { marginTop: 10, marginHorizontal: mGutter, padding: 14, borderRadius: 14, backgroundColor: m.beige, borderWidth: 1.5, borderColor: m.gold, flexDirection: 'row', alignItems: 'center', gap: 12 },
  inBoxTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inBoxTitle: { fontSize: 15, color: m.ink, ...mFont(500) },
  inBoxSub: { fontSize: 13, color: m.muted, marginTop: 2, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 20, height: 38, backgroundColor: m.white },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark },
  stepQty: { minWidth: 18, textAlign: 'center', fontSize: 15, color: m.ink, ...mFont(400) },
  details: { marginTop: 24, marginHorizontal: mGutter, borderTopWidth: 1, borderTopColor: m.line },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: m.line },
  listT: { fontSize: 16, color: m.ink, ...mFont(400) },
  listS: { fontSize: 13, color: m.muted, marginTop: 2, ...mFont(300) },
  listC: { fontSize: 20, color: m.goldDark },
  secRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: mGutter, marginBottom: 14 },
  secH2: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.ink, ...mFont(500) },
  rail: { paddingHorizontal: mGutter, gap: 12, paddingBottom: 4 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  rolePrice: { fontSize: 14.5, color: m.ink, ...mFont(500) },
});
