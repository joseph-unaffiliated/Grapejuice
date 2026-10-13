import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../../components/ui/Icon';
import { icons } from '../../constants/icons';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { availabilityRemaining, LOW_STOCK_AT } from '../../services/catalog/availability';
import { MobileButton } from '../../components/mobile/MobileButton';
import { MobileSheet } from '../../components/mobile/MobileSheet';
import { ProductTileMobile, stockStatus } from '../../components/mobile/ProductTileMobile';
import { StickyBar, STICKY_BAR_CLEARANCE } from '../../components/mobile/StickyBar';
import { BoxPitch } from '../../components/mobile/BoxPitch';
import { ProductNote } from '../../components/box/ProductNote';
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
  /** Products from other categories, below the same-category shelf. */
  alsoLike?: CatalogItem[];
  alsoTitle?: string;
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
  /**
   * Catalog "Add to my box" landed here. Run the same action as this page's
   * Add button once, then the screen clears the flag.
   */
  openAdd?: boolean;
  onConsumeOpenAdd?: () => void;
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
  onSeeAllAlso?: () => void;
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
  const [role, setRole] = useState(0);
  const imageH = Math.round((width * 6) / 7);
  const scrollRef = useRef<ScrollView>(null);
  const photos = useMemo(() => (p.item.imageUrls?.length ? p.item.imageUrls : p.item.imageUrl ? [p.item.imageUrl] : []), [p.item]);
  const remaining = p.availability ? availabilityRemaining(p.availability) : null;
  const low = !p.soldOut && remaining != null && remaining > 0 && remaining <= LOW_STOCK_AT;
  const desc = (p.item.description ?? '').trim();
  const shortDesc = desc.length > 160 && !more ? `${desc.slice(0, 157).trimEnd()}…` : desc;

  /** Same press as the sticky "Add to my box" — sheet when there's a choice, otherwise that one action. */
  const pressAddToMyBox = () => {
    if (p.locked || p.saving) return;
    if (p.roleOptions.length > 1) {
      setRole(0);
      setChooser(true);
    } else {
      void p.roleOptions[0]?.onPress();
    }
  };

  /**
   * Whatever the bottom bar's button would do right now. Catalog arrival with
   * `openAdd` uses this so signed-out / no-swap / sold-out match a manual tap.
   */
  const pressBarCta = () => {
    if (p.soldOut) {
      if (p.onNotifyBack) p.onNotifyBack();
      return;
    }
    if (p.inBox) {
      p.onViewBox();
      return;
    }
    if (p.hasBox) {
      pressAddToMyBox();
      return;
    }
    if (!p.saving && p.onBuyJustThis) p.onBuyJustThis();
  };

  const openAddOnce = useRef(false);
  useEffect(() => {
    if (!p.openAdd) {
      openAddOnce.current = false;
      return;
    }
    if (openAddOnce.current) return;
    openAddOnce.current = true;
    p.onConsumeOpenAdd?.();
    pressBarCta();
    // Fire only on the openAdd edge. Handlers are current on that render; the product
    // screen mounts this body after the box and catalog have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.openAdd]);

  const bar = p.soldOut ? (
    <StickyBar label="Sold out" total={p.onNotifyBack ? 'We can email you if it comes back' : ''} layout="row" cta={{ label: 'Email me if it’s back', onPress: p.onNotifyBack ?? (() => {}), variant: 'secondary', disabled: !p.onNotifyBack }} />
  ) : p.inBox ? (
    <StickyBar label={p.inBoxUnitCents > 0 ? `Added${p.kidNameForGift ? ` for ${p.kidNameForGift}` : ''}` : 'In your box'} total={p.inBoxUnitCents > 0 ? `+${formatCatalogDollars(p.inBoxUnitCents * p.boxQuantity)}` : 'Included'} cta={{ label: 'View my box', onPress: p.onViewBox, variant: 'secondary' }} />
  ) : p.hasBox ? (
    <StickyBar total={p.memberCents > 0 ? formatCatalogDollars(p.memberCents) : 'Included'} cta={{ label: 'Add to my box', onPress: pressAddToMyBox, disabled: p.locked || p.saving, busy: p.saving }} />
  ) : (
    <StickyBar label="On its own" total={formatCatalogDollars(p.priceCents)} cta={{ label: 'Add to Cart', onPress: p.onBuyJustThis ?? (() => {}), disabled: !p.onBuyJustThis || p.saving }} />
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
        <ProductNote itemId={p.item.id} style={[styles.desc, styles.note]} linkStyle={styles.moreLink} onOpenProduct={p.onOpenProduct} />
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
          <View key={d.label} style={styles.listRow}>
            <Text style={styles.listT}>{d.label}</Text>
            <Text style={styles.listS}>{d.value}</Text>
          </View>
        ))}
      </View>

      <ProductShelf title={p.similarTitle} items={p.similar} onSeeAll={p.onSeeAll} onOpenProduct={p.onOpenProduct} availabilityById={p.availabilityById} />
      <ProductShelf title={p.alsoTitle ?? 'You might also like...'} items={p.alsoLike ?? []} onSeeAll={p.onSeeAllAlso} onOpenProduct={p.onOpenProduct} availabilityById={p.availabilityById} padTop={p.similar.length ? 8 : 36} />
      <View style={{ height: 40 }} />

      {bar}

      <MobileSheet
        visible={chooser}
        onClose={() => setChooser(false)}
        accessibilityLabel="How should it join your box?"
        footer={
          <MobileButton
            label="Add to my box"
            onPress={() => {
              const o = p.roleOptions[role];
              setChooser(false);
              if (o) void o.onPress();
            }}
          />
        }
      >
        <View style={styles.roleHead}>
          {photos[0] ? <Image source={{ uri: photos[0] }} style={styles.roleThumb} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.roleEyebrow}>Add to your box as…</Text>
            <Text style={styles.roleName} numberOfLines={2}>{p.item.name}</Text>
          </View>
        </View>
        {p.roleOptions.map((o, i) => {
          const on = i === role;
          return (
            <Pressable key={o.key} onPress={() => setRole(i)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.role, on && styles.roleOn]}>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>{o.title}</Text>
                <Text style={styles.roleDetail}>{o.detail}</Text>
              </View>
              <Text style={styles.rolePrice}>{o.price}</Text>
            </Pressable>
          );
        })}
      </MobileSheet>
    </View>
  );
}

function ProductShelf({
  title,
  items,
  onSeeAll,
  onOpenProduct,
  availabilityById,
  padTop = 36,
}: {
  title: string;
  items: CatalogItem[];
  onSeeAll?: () => void;
  onOpenProduct: (slug: string) => void;
  availabilityById?: Record<string, CatalogAvailability>;
  padTop?: number;
}) {
  if (!items.length) return null;
  return (
    <View style={{ paddingTop: padTop, paddingBottom: 8 }}>
      <View style={styles.secRow}>
        <Text style={styles.secH2}>{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.moreLink}>See all</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.slice(0, 8).map((it) => (
          <ProductTileMobile key={it.id} item={it} width={150} status={stockStatus(availabilityById?.[it.id])} onPress={() => onOpenProduct(it.id)} />
        ))}
      </ScrollView>
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
  note: { marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: m.beige, overflow: 'hidden' },
  inBoxCard: { marginTop: 10, marginHorizontal: mGutter, padding: 14, borderRadius: 14, backgroundColor: m.beige, borderWidth: 1.5, borderColor: m.gold, flexDirection: 'row', alignItems: 'center', gap: 12 },
  inBoxTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inBoxTitle: { fontSize: 15, color: m.ink, ...mFont(500) },
  inBoxSub: { fontSize: 13, color: m.muted, marginTop: 2, ...mFont(400) },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: m.gold, borderRadius: 20, height: 38, backgroundColor: m.white },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: m.goldDark },
  stepQty: { minWidth: 18, textAlign: 'center', fontSize: 15, color: m.ink, ...mFont(400) },
  details: { marginTop: 24, marginHorizontal: mGutter, borderTopWidth: 1, borderTopColor: m.line },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, minHeight: 54, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: m.line },
  listT: { width: 132, flexShrink: 0, fontSize: 16, lineHeight: 21, color: m.ink, ...mFont(400) },
  listS: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, color: m.muted, marginTop: 2, ...mFont(300) },
  listC: { fontSize: 20, color: m.goldDark },
  secRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: mGutter, marginBottom: 14 },
  secH2: { fontSize: 22, lineHeight: 27, letterSpacing: -0.5, color: m.ink, ...mFont(500) },
  rail: { paddingHorizontal: mGutter, gap: 12, paddingBottom: 4 },
  roleHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingBottom: 14 },
  roleThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: m.img },
  roleEyebrow: { fontSize: 13.5, color: m.goldDark, ...mFont(400) },
  roleName: { fontSize: 18, lineHeight: 23, color: m.ink, marginTop: 2, ...mFont(500) },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: m.lineWarm, backgroundColor: m.white },
  roleOn: { borderColor: m.gold, backgroundColor: m.beige },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: m.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: m.white },
  radioOn: { borderColor: m.goldDark },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: m.gold },
  roleTitle: { fontSize: 15.5, color: m.ink, ...mFont(400) },
  roleDetail: { fontSize: 12.5, color: m.muted, marginTop: 2, ...mFont(400) },
  rolePrice: { fontSize: 14, color: m.ink, ...mFont(400) },
});
