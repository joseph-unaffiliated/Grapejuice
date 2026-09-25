import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
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
  WEB_FONT_FAMILY,
} from '../../constants/theme';
import {
  WelcomeSubscriberBadge,
  isWelcomeMenorah,
} from './WelcomeSubscriberBadge';
import { isBookItem } from '../../constants/storefrontCategories';

export type StorefrontTileBoxRelation = 'in_box' | 'swap' | 'add';

const DESCRIPTION_MAX_LINES = 4;
const DESCRIPTION_LINE_HEIGHT = 14;
const DESCRIPTION_FONT_SIZE = 11;

function endsWithSentencePunctuation(text: string): boolean {
  return /[.!?…]$/u.test(text);
}

/**
 * After fitting to the line budget: no "…" when we end on a sentence or
 * paragraph break; "…" only for a true mid-sentence cut.
 */
function finalizeClampedDescription(visibleRaw: string, wasTruncated: boolean): string {
  let visible = visibleRaw.replace(/\s+$/u, '').trimEnd();
  if (!visible) return '';
  if (!wasTruncated) return visible;

  // Stop before a blank / paragraph break inside the window.
  const paraBreak = visible.search(/\n\s*\n/);
  if (paraBreak >= 0) {
    const beforePara = visible.slice(0, paraBreak).trimEnd();
    if (beforePara) return beforePara;
  }

  if (endsWithSentencePunctuation(visible)) return visible;

  // Prefer the last complete sentence in the window over a mid-sentence "…".
  const lastSentenceEnd = Math.max(
    visible.lastIndexOf('.'),
    visible.lastIndexOf('!'),
    visible.lastIndexOf('?')
  );
  if (lastSentenceEnd >= Math.min(32, Math.floor(visible.length * 0.35))) {
    return visible.slice(0, lastSentenceEnd + 1).trimEnd();
  }

  return `${visible.replace(/[,;:\-–—\s]+$/u, '')}…`;
}

function clampDescriptionFromLines(
  full: string,
  lines: ReadonlyArray<{ text: string }>,
  maxLines: number
): string {
  const trimmed = full.trim();
  if (!trimmed) return '';
  if (lines.length <= maxLines) return trimmed;
  const visible = lines
    .slice(0, maxLines)
    .map((l) => l.text)
    .join('');
  return finalizeClampedDescription(visible, true);
}

/** Web: RN-web has no onTextLayout — binary-search a DOM probe at the tile width. */
function clampDescriptionByDom(
  full: string,
  contentWidth: number,
  maxLines: number,
  lineHeight: number,
  fontSize: number
): string {
  const trimmed = full.trim();
  if (!trimmed || contentWidth <= 0 || typeof document === 'undefined') {
    return trimmed;
  }

  const maxHeight = lineHeight * maxLines;
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:absolute',
    'left:-99999px',
    'top:0',
    `width:${Math.floor(contentWidth)}px`,
    `font-family:${WEB_FONT_FAMILY}, sans-serif`,
    'font-weight:400',
    `font-size:${fontSize}px`,
    `line-height:${lineHeight}px`,
    'letter-spacing:normal',
    'white-space:normal',
    'word-wrap:break-word',
    'overflow-wrap:anywhere',
    'visibility:hidden',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(probe);

  const fits = (text: string) => {
    probe.textContent = text;
    return probe.scrollHeight <= maxHeight + 1;
  };

  try {
    if (fits(trimmed)) return trimmed;

    let lo = 0;
    let hi = trimmed.length;
    let best = '';
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = trimmed.slice(0, mid).replace(/\s+$/u, '');
      if (fits(candidate)) {
        best = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (!best) return trimmed.slice(0, Math.min(24, trimmed.length)) + '…';

    let result = finalizeClampedDescription(best, true);
    while (result.endsWith('…') && !fits(result) && best.length > 0) {
      best = best.slice(0, -1).replace(/\s+$/u, '');
      result = finalizeClampedDescription(best, true);
    }
    return result;
  } finally {
    document.body.removeChild(probe);
  }
}

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
  /** Horizontal rails: omit bottom margin (grid uses it for row gap). */
  flushBottom?: boolean;
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
  flushBottom = false,
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
  const [descriptionShown, setDescriptionShown] = useState(description);
  // Books keep a single cover image — no hover secondary reveal.
  const canCrossfade =
    Platform.OS === 'web' && Boolean(secondaryUrl) && !isBookItem(item);

  useEffect(() => {
    if (!description) {
      setDescriptionShown('');
      return;
    }
    if (Platform.OS === 'web') {
      setDescriptionShown(
        clampDescriptionByDom(
          description,
          width,
          DESCRIPTION_MAX_LINES,
          DESCRIPTION_LINE_HEIGHT,
          DESCRIPTION_FONT_SIZE
        )
      );
      return;
    }
    // Native: wait for onTextLayout measurement.
    setDescriptionShown(description);
  }, [description, width]);

  const onDescriptionTextLayout = (
    e: NativeSyntheticEvent<TextLayoutEventData>
  ) => {
    if (Platform.OS === 'web') return;
    const next = clampDescriptionFromLines(
      description,
      e.nativeEvent.lines,
      DESCRIPTION_MAX_LINES
    );
    setDescriptionShown((prev) => (prev === next ? prev : next));
  };

  return (
    <View style={[styles.root, flushBottom && styles.rootFlushBottom, { width }]}>
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
          style={[styles.heart, wishlisted && styles.heartWishlisted]}
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
            color={wishlisted ? semanticColors.secondary : '#FFFFFF'}
          />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {description ? (
          <View style={styles.descriptionWrap}>
            {Platform.OS !== 'web' ? (
              <Text
                style={[styles.description, styles.descriptionMeasure]}
                onTextLayout={onDescriptionTextLayout}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {description}
              </Text>
            ) : null}
            <Text style={styles.description}>{descriptionShown}</Text>
          </View>
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
    marginBottom: spacing.xl,
  },
  rootFlushBottom: {
    marginBottom: 0,
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
  /** Match lifestyle hotspots: white ring, no fill. */
  heart: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  /** Favorited: solid white disk + filled heart (unchanged). */
  heartWishlisted: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  name: {
    ...typeface('medium'),
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
    color: semanticColors.textPrimary,
    marginBottom: 8,
  },
  description: {
    ...typeface('regular'),
    fontSize: 11,
    lineHeight: DESCRIPTION_LINE_HEIGHT,
    color: semanticColors.textSecondary,
    marginBottom: 10,
  },
  descriptionWrap: {
    position: 'relative',
    width: '100%',
  },
  descriptionMeasure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    pointerEvents: 'none',
    marginBottom: 0,
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
