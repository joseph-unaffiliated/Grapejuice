import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
} from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { CartQtyStepper } from './CartQtyStepper';
import { formatCatalogDollars } from '../../services/box/buildDefaultBox';
import {
  formatSubscriberOfferLine,
  formatWithoutBoxOfferLine,
  resolveCatalogDisplayPrices,
} from '../../services/box/pricing';
import {
  boxOnlyAvailabilityLine,
  boxOnlyHeroPrice,
  boxOnlyNotAvailableWithoutBoxLine,
} from '../../services/catalog/availabilityCopy';
import type { CatalogAvailability, CatalogItem } from '../../types/pilot';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
} from '../../constants/theme';
import {
  WelcomeSubscriberBadge,
  isWelcomeMenorah,
} from './WelcomeSubscriberBadge';
import { isBookItem } from '../../constants/storefrontCategories';

export type StorefrontTileBoxRelation = 'in_box' | 'swap' | 'add';

type Props = {
  item: CatalogItem;
  width: number;
  wishlisted: boolean;
  onPress: () => void;
  onToggleWishlist: () => void;
  availability?: CatalogAvailability;
  /** When a box is started: In box / Swap / Add action under price. */
  boxRelation?: StorefrontTileBoxRelation | null;
  /** Quantity when `boxRelation === 'in_box'`. */
  boxQuantity?: number;
  /** Delta (+1 / −1); at qty 1, −1 removes. */
  onBoxQtyChange?: (delta: 1 | -1) => void;
};

function firstSecondaryUrl(item: CatalogItem): string | null {
  const primary = item.imageUrl?.trim() ?? '';
  for (const raw of item.imageUrls ?? []) {
    const u = raw?.trim();
    if (u && u !== primary) return u;
  }
  return null;
}

export function StorefrontProductTile({
  item,
  width,
  wishlisted,
  onPress,
  onToggleWishlist,
  availability,
  boxRelation = null,
  boxQuantity = 1,
  onBoxQtyChange,
}: Props) {
  const imageSize = Math.max(120, width);
  const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
  const showMember =
    memberCents > 0 && nonMemberCents > 0 && memberCents < nonMemberCents;
  const hasStartedBox = boxRelation != null;
  const defaultPrice =
    nonMemberCents > 0
      ? formatCatalogDollars(nonMemberCents)
      : memberCents > 0
        ? formatCatalogDollars(memberCents)
        : formatCatalogDollars(item.dollarCostCents);
  const memberPrice = memberCents > 0 ? formatCatalogDollars(memberCents) : defaultPrice;
  const showWelcomeBadge = isWelcomeMenorah(item);
  const isBoxOnly = availability?.status === 'box_only';
  const isSoldOut = availability?.status === 'sold_out';
  const description = item.description?.trim() ?? '';
  const secondaryUrl = firstSecondaryUrl(item);
  const [hoverSecondary, setHoverSecondary] = useState(false);
  // Books keep a single cover image — no hover secondary reveal.
  const canCrossfade =
    Platform.OS === 'web' && Boolean(secondaryUrl) && !isBookItem(item);

  return (
    <View style={[styles.root, { width }]}>
      <View style={[styles.imageWrap, { width, height: imageSize }]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          onHoverIn={canCrossfade ? () => setHoverSecondary(true) : undefined}
          onHoverOut={canCrossfade ? () => setHoverSecondary(false) : undefined}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          <View style={{ width: imageSize, height: imageSize }}>
            <BoxItemImage
              size={imageSize}
              itemId={item.id}
              imageUrl={item.imageUrl}
              style={styles.image}
            />
            {canCrossfade && secondaryUrl ? (
              <View
                pointerEvents="none"
                style={[
                  styles.secondaryLayer,
                  { opacity: hoverSecondary ? 1 : 0 },
                  Platform.OS === 'web'
                    ? ({ transition: 'opacity 200ms ease' } as object)
                    : null,
                ]}
              >
                <BoxItemImage
                  size={imageSize}
                  itemId={item.id}
                  imageUrl={secondaryUrl}
                  style={styles.image}
                />
              </View>
            ) : null}
          </View>
        </Pressable>
        {showWelcomeBadge && !isBoxOnly ? (
          <View style={styles.welcomeBadge}>
            <WelcomeSubscriberBadge compact />
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.heart}
          onPress={onToggleWishlist}
          accessibilityRole="button"
          accessibilityLabel={
            wishlisted ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`
          }
          hitSlop={10}
        >
          <Icon
            icon={wishlisted ? icons.heart : icons.heartOutline}
            size={16}
            color={wishlisted ? semanticColors.secondary : semanticColors.logoDark}
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        {isBoxOnly ? (
          <View style={styles.priceRow}>
            <Text style={styles.price}>{boxOnlyHeroPrice(item)}</Text>
            <Text style={styles.memberPrice}>
              {hasStartedBox
                ? boxOnlyNotAvailableWithoutBoxLine()
                : boxOnlyAvailabilityLine()}
            </Text>
          </View>
        ) : isSoldOut ? (
          <Text style={[styles.price, styles.soldOutPrice]}>Sold out</Text>
        ) : showMember && hasStartedBox ? (
          <View style={styles.priceRow}>
            <Text style={styles.price}>{memberPrice}</Text>
            <Text style={styles.memberPrice}>
              {formatWithoutBoxOfferLine(formatCatalogDollars(nonMemberCents))}
            </Text>
          </View>
        ) : showMember ? (
          <View style={styles.priceRow}>
            <Text style={styles.price}>{defaultPrice}</Text>
            <Text style={styles.memberPrice}>
              {formatSubscriberOfferLine(
                formatCatalogDollars(memberCents),
                nonMemberCents,
                memberCents
              )}
            </Text>
          </View>
        ) : (
          <Text style={styles.price}>{defaultPrice}</Text>
        )}
      </TouchableOpacity>
      {boxRelation === 'in_box' && onBoxQtyChange ? (
        <View style={styles.chipRow}>
          <CartQtyStepper
            quantity={boxQuantity}
            onChange={onBoxQtyChange}
            label={item.name}
          />
        </View>
      ) : boxRelation === 'swap' ? (
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, styles.chipPrimary]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Swap into my box ${item.name}`}
          >
            <Text style={[styles.chipText, styles.chipTextPrimary]}>swap into my box</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, styles.chipPrimary]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Add to my box ${item.name}`}
          >
            <Text style={[styles.chipText, styles.chipTextPrimary]}>add to my box</Text>
          </TouchableOpacity>
        </View>
      ) : boxRelation === 'add' ? (
        <TouchableOpacity
          style={[styles.chip, styles.chipPrimary, styles.chipSpaced]}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Add to my box ${item.name}`}
        >
          <Text style={[styles.chipText, styles.chipTextPrimary]}>add to my box</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.md,
  },
  imageWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: semanticColors.accentCream,
  },
  image: {
    borderRadius: borderRadius.md,
  },
  secondaryLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  welcomeBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    zIndex: 2,
  },
  heart: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  name: {
    ...typeface('medium'),
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: semanticColors.textPrimary,
    marginBottom: 4,
  },
  description: {
    ...typeface('regular'),
    fontSize: 11,
    lineHeight: 14,
    color: semanticColors.textSecondary,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
  },
  price: {
    ...typeface('medium'),
    fontSize: 18,
    color: semanticColors.logoDark,
  },
  soldOutPrice: {
    color: semanticColors.textTertiary,
    textDecorationLine: 'line-through',
  },
  memberPrice: {
    ...typeface('regular'),
    fontSize: 11,
    color: semanticColors.goldMuted,
    flexShrink: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  /** My Box ActionChip look — pill, not full-width dark button. */
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: semanticColors.goldMuted,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    minHeight: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.bgPrimary,
  },
  chipPrimary: {
    backgroundColor: semanticColors.logoDark,
    borderColor: semanticColors.logoDark,
  },
  chipSpaced: {
    marginTop: spacing.sm,
  },
  chipText: {
    ...typeface('regular'),
    fontSize: 9,
    letterSpacing: -0.18,
    textTransform: 'lowercase',
    color: semanticColors.goldMuted,
    lineHeight: 14,
  },
  chipTextPrimary: {
    color: semanticColors.goldMuted,
  },
});
