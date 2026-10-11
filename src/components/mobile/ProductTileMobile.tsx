import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { useWishlist } from '../../hooks/useWishlist';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import { resolveCatalogDisplayPrices } from '../../services/box/pricing';
import type { CatalogItem } from '../../types/pilot';
import { MobileButton } from './MobileButton';
import { m, mFont, mRadius } from './mobileTheme';

export type TileStatus =
  | { kind: 'inbox'; text?: string }
  | { kind: 'added'; text: string }
  | { kind: 'low'; text: string }
  | { kind: 'sold' }
  | null;

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
  const inBox = status?.kind === 'inbox';
  const sold = status?.kind === 'sold';

  return (
    <View style={[styles.root, { width }, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} style={[styles.imageWrap, inBox && styles.imageInBox]}>
        <BoxItemImage size={width} imageUrl={item.imageUrl} itemId={item.id} style={styles.image} />
        {inBox ? (
          <View style={styles.check} accessibilityLabel="In your box">
            <Text style={styles.checkMark}>✓</Text>
          </View>
        ) : null}
        {sold ? (
          <View style={styles.soldTag}>
            <Text style={styles.soldText}>Sold out</Text>
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
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {status?.kind === 'inbox' ? (
          <Text style={styles.statusGold}>{status.text ?? 'In your box · included'}</Text>
        ) : status?.kind === 'added' ? (
          <Text style={styles.statusGold}>{status.text}</Text>
        ) : status?.kind === 'low' ? (
          <Text style={styles.statusLow}>{status.text}</Text>
        ) : !hidePrice ? (
          <Text style={[styles.price, sold && styles.priceSold]}>{formatCatalogDollars(price)}</Text>
        ) : null}
      </Pressable>
      {action ? <MobileButton label={action.label} onPress={action.onPress} variant={action.variant ?? 'secondary'} height={40} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  imageWrap: { borderRadius: mRadius.md, overflow: 'hidden', backgroundColor: m.img, position: 'relative' },
  imageInBox: { borderWidth: 2, borderColor: m.gold },
  image: { width: '100%', aspectRatio: 1, borderRadius: 0 },
  check: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: m.gold, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: m.ink, fontSize: 13, ...mFont(700) },
  heart: { position: 'absolute', top: 9.5, right: 9, width: 15, height: 15, alignItems: 'center', justifyContent: 'center' },
  soldTag: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: m.ink, paddingVertical: 3, alignItems: 'center' },
  soldText: { color: m.white, fontSize: 10, ...mFont(500) },
  name: { fontSize: 14.5, lineHeight: 19, color: m.ink, ...mFont(400), marginTop: 4 },
  price: { fontSize: 13.5, color: m.muted, ...mFont(400), marginTop: 2 },
  priceSold: { textDecorationLine: 'line-through' },
  statusGold: { fontSize: 12.5, color: m.goldDark, ...mFont(400), marginTop: 2 },
  statusLow: { fontSize: 12.5, color: m.warn, ...mFont(400), marginTop: 2 },
  action: { marginTop: 4 },
});
