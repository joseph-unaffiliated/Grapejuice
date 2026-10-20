import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useWishlist } from '../../hooks/useWishlist';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import { availabilityRemaining, LOW_STOCK_AT } from '../../services/catalog/availability';
import { isCatalogItemSoldOut } from '../../services/box/soldOutReconcile';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import { MobileButton } from './MobileButton';
import { balanceProps, m, mFont, mRadius } from './mobileTheme';

export type TileStatus =
  | { kind: 'inbox'; text?: string }
  | { kind: 'added'; text: string }
  | { kind: 'low' }
  | { kind: 'sold' }
  | null;

/** Sold out, or "Low stock" once 4 or fewer are left. Shoppers never see the count. */
export function stockStatus(avail: CatalogAvailability | undefined, item?: CatalogItem): TileStatus {
  if (avail?.status === 'sold_out') return { kind: 'sold' };
  // Box-only items (books) never report sold_out through availability; their
  // catalog stock count is the authority.
  if (item && isCatalogItemSoldOut(item)) return { kind: 'sold' };
  if (!avail) return null;
  const left = availabilityRemaining(avail);
  return left != null && left > 0 && left <= LOW_STOCK_AT ? { kind: 'low' } : null;
}

type Props = {
  item: CatalogItem;
  width: number;
  onPress: () => void;
  /** Box relationship shown under the name; "In your box" tiles get the gold outline. */
  status?: TileStatus;
  /** Button under the price ("Add to my box", "View my box"). */
  action?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
  /** Hide the price line (box pitch, home top picks keep it). */
  hidePrice?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Product tile for the phone layouts: main product photo, the site's favorite heart as a
 * white outline (filled once saved), name, price, and the item's relationship to your box.
 */
export function ProductTileMobile({ item, width, onPress, status = null, action, hidePrice, style }: Props) {
  const { isWishlisted, toggleWishlist } = useWishlist();
  const saved = isWishlisted(item.id);
  const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
  const price = nonMemberCents > 0 ? nonMemberCents : memberCents;
  const inBox = status?.kind === 'inbox' || status?.kind === 'added';
  const sold = status?.kind === 'sold';
  const corner = sold ? 'Sold out' : status?.kind === 'low' ? 'Low stock' : null;

  return (
    <View style={[styles.root, { width }, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} style={[styles.imageWrap, inBox && styles.imageInBox]}>
        <BoxItemImage size={width} imageUrl={item.imageUrl} itemId={item.id} style={sold ? { ...styles.image, ...styles.imageSold } : styles.image} />
        {inBox ? (
          <View style={styles.check} accessibilityLabel="In your box">
            <Icon icon={icons.check} size={11} color={m.ink} />
          </View>
        ) : corner ? (
          <View style={styles.corner}>
            <Text style={styles.cornerText}>{corner}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => void toggleWishlist(item.id)}
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${item.name} from favorites` : `Save ${item.name} to favorites`}
          hitSlop={10}
          style={styles.heart}
        >
          <Icon icon={saved ? icons.heart : icons.heartOutline} size={15} color={m.white} />
        </Pressable>
      </Pressable>
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text style={styles.name} numberOfLines={2} {...balanceProps}>
          {item.name}
        </Text>
        {status?.kind === 'inbox' ? (
          <Text style={styles.statusGold}>{status.text ?? 'In your box · included'}</Text>
        ) : status?.kind === 'added' ? (
          <Text style={styles.statusGold}>{status.text}</Text>
        ) : sold ? (
          <Text style={styles.price}>Sold out</Text>
        ) : !hidePrice ? (
          <Text style={styles.price}>{formatCatalogDollars(price)}</Text>
        ) : null}
      </Pressable>
      {sold ? (
        <MobileButton label="Sold out" onPress={() => {}} variant="secondary" disabled height={38} style={styles.action} />
      ) : action ? (
        <MobileButton label={action.label} onPress={action.onPress} variant={action.variant ?? 'secondary'} height={38} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  imageWrap: { borderRadius: mRadius.md, overflow: 'hidden', backgroundColor: m.img, position: 'relative' },
  imageInBox: { borderWidth: 2, borderColor: m.gold },
  image: { width: '100%', aspectRatio: 1, borderRadius: 0 },
  imageSold: { opacity: 0.5 },
  check: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', top: 6, left: 6, backgroundColor: m.white, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  cornerText: { fontSize: 10.5, lineHeight: 13, color: m.ink, ...mFont(500) },
  heart: { position: 'absolute', top: 9.5, right: 9, width: 15, height: 15, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, lineHeight: 18, color: m.ink, ...mFont(400), marginTop: 2 },
  price: { fontSize: 13, lineHeight: 18, color: m.muted, ...mFont(400), marginTop: 6 },
  statusGold: { fontSize: 13, lineHeight: 18, color: m.goldDark, ...mFont(400), marginTop: 6 },
  action: { marginTop: 2 },
});
