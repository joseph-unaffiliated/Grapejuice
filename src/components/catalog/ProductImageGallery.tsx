import React, { useMemo, useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { BoxItemImage } from '../box/BoxItemImage';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import { LAYOUT, borderRadius, spacing } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import {
  WelcomeSubscriberBadge,
  isWelcomeMenorah,
} from '../storefront/WelcomeSubscriberBadge';

type Props = {
  itemId: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  maxWidth?: number;
  style?: ViewStyle;
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
  wishlistDisabled?: boolean;
};

function collectUrls(imageUrl?: string | null, imageUrls?: string[] | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [imageUrl, ...(imageUrls ?? [])]) {
    if (!u || typeof u !== 'string') continue;
    const trimmed = u.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

const THUMB = 64;
const THUMB_MOBILE = 52;
/** Desktop thumbs column + root row gap — kept in sync with styles.thumbsCol / root.gap */
const DESKTOP_THUMB_RESERVE = THUMB + spacing.sm;

export function ProductImageGallery({
  itemId,
  imageUrl,
  imageUrls,
  maxWidth,
  style,
  wishlisted = false,
  onToggleWishlist,
  wishlistDisabled = false,
}: Props) {
  const { colors } = useThemeMode();
  const { width } = useWindowDimensions();
  const compact = width < LAYOUT.BREAKPOINT_TABLET;
  const urls = useMemo(() => collectUrls(imageUrl, imageUrls), [imageUrl, imageUrls]);
  const [selected, setSelected] = useState(0);
  const activeIndex = Math.min(selected, Math.max(0, urls.length - 1));
  const activeUrl = urls[activeIndex];
  const canPrev = urls.length > 1 && activeIndex > 0;
  const canNext = urls.length > 1 && activeIndex < urls.length - 1;

  const showThumbs = urls.length > 1;
  // Desktop hero is capped at 80vh; thumbs (+ gap) sit beside it. When thumbs
  // are absent, expand the hero by that same reserve so the gallery's right
  // edge (and gap to the details column) stays put.
  const webHeroMax = showThumbs ? '80vh' : `calc(80vh + ${DESKTOP_THUMB_RESERVE}px)`;

  const thumbs = showThumbs ? (
    <View style={[styles.thumbsCol, compact && styles.thumbsRow]}>
      {urls.map((url, i) => {
        const isActive = i === activeIndex;
        return (
          <TouchableOpacity
            key={url}
            onPress={() => setSelected(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={[
              styles.thumb,
              compact && styles.thumbCompact,
              {
                borderColor: isActive ? colors.textPrimary : colors.border,
                backgroundColor: colors.brandLight,
              },
            ]}
          >
            <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="cover" />
          </TouchableOpacity>
        );
      })}
    </View>
  ) : null;

  return (
    <View
      style={[
        styles.root,
        compact && styles.rootCompact,
        maxWidth != null ? { maxWidth, width: '100%' } : undefined,
        style,
      ]}
    >
      {!compact ? thumbs : null}

      <View style={styles.heroWrap}>
        <View
          style={[
            styles.hero,
            compact && styles.heroCompact,
            !compact && Platform.OS === 'web'
              ? ({
                  width: `min(100%, ${webHeroMax})`,
                  maxWidth: webHeroMax,
                  maxHeight: webHeroMax,
                } as object)
              : null,
            { backgroundColor: colors.brandLight },
          ]}
        >
          {activeUrl ? (
            <Image source={{ uri: activeUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <BoxItemImage
              size={Platform.OS === 'web' ? 480 : 320}
              itemId={itemId}
              imageUrl={imageUrl}
              style={styles.heroFallback}
            />
          )}
        </View>
        {isWelcomeMenorah({ id: itemId }) ? (
          <View style={styles.welcomeBadge} pointerEvents="none">
            <WelcomeSubscriberBadge />
          </View>
        ) : null}
        {onToggleWishlist ? (
          <TouchableOpacity
            style={[
              styles.favorite,
              wishlisted ? styles.favoriteOn : styles.favoriteOff,
              wishlistDisabled && styles.favoriteDisabled,
            ]}
            onPress={onToggleWishlist}
            disabled={wishlistDisabled}
            accessibilityRole="button"
            accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            accessibilityState={{ selected: wishlisted }}
            hitSlop={4}
          >
            <Icon
              icon={wishlisted ? icons.heart : icons.heartOutline}
              size={18}
              color={wishlisted ? '#000' : '#fff'}
            />
          </TouchableOpacity>
        ) : null}
        {showThumbs ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Previous image"
              disabled={!canPrev}
              onPress={() => setSelected((i) => Math.max(0, i - 1))}
              style={[styles.arrow, styles.arrowLeft, { opacity: canPrev ? 1 : 0.35 }]}
            >
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Next image"
              disabled={!canNext}
              onPress={() => setSelected((i) => Math.min(urls.length - 1, i + 1))}
              style={[styles.arrow, styles.arrowRight, { opacity: canNext ? 1 : 0.35 }]}
            >
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {compact ? thumbs : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rootCompact: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  thumbsCol: {
    width: THUMB,
    gap: spacing.sm,
    flexShrink: 0,
  },
  thumbsRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbCompact: {
    width: THUMB_MOBILE,
    height: THUMB_MOBILE,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  heroWrap: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
    width: '100%',
  },
  hero: {
    width: '100%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    aspectRatio: 1,
    // Web max size applied inline so single-image PDPs can expand into the
    // desktop thumb column reserve (see webHeroMax in the component).
    ...(Platform.OS === 'web' ? ({ height: 'auto' } as object) : { minHeight: 320 }),
  },
  heroCompact: {
    ...(Platform.OS === 'web'
      ? ({
          width: '100%',
          maxWidth: '100%',
          maxHeight: undefined,
          height: 'auto',
        } as object)
      : { minHeight: 280 }),
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderWidth: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  arrowLeft: { left: spacing.sm },
  arrowRight: { right: spacing.sm },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 40,
    marginTop: -2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  welcomeBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    zIndex: 3,
  },
  favorite: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  favoriteOff: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  favoriteOn: {
    backgroundColor: '#fff',
    borderWidth: 0,
  },
  favoriteDisabled: { opacity: 0.55 },
});
