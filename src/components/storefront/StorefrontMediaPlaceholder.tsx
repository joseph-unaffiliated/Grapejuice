import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../ui/Icon';
import { icons } from '../../constants/icons';
import {
  borderRadius,
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import type { StorefrontMediaSlot } from '../../constants/storefrontMedia';
import { StorefrontWebVideo } from './StorefrontWebVideo';

type Props = {
  slot: StorefrontMediaSlot;
  style?: StyleProp<ViewStyle>;
  /** Override min height when aspect alone isn’t enough (hero). */
  minHeight?: number;
  /**
   * Hide caption labels (hero under copy/CTAs — avoids overlapping text).
   * Still keeps a cream wash so the frame isn’t empty.
   */
  quiet?: boolean;
  /** Fill parent bounds (no intrinsic aspect). Image covers and centers. */
  fill?: boolean;
};

function resolveAssetUri(src: string | number | ImageSourcePropType | null | undefined): string | null {
  if (src == null) return null;
  if (typeof src === 'string') return src;
  if (typeof src === 'number') {
    const resolved = Image.resolveAssetSource(src);
    return resolved?.uri ?? null;
  }
  if (typeof src === 'object' && 'uri' in src && typeof src.uri === 'string') {
    return src.uri;
  }
  return null;
}

function toImageSource(
  src: string | number | ImageSourcePropType | null | undefined
): ImageSourcePropType | null {
  if (src == null) return null;
  if (typeof src === 'string') return { uri: src };
  return src as ImageSourcePropType;
}

/** Cream/gold frame until lifestyle assets exist (`slot.src`). */
export function StorefrontMediaPlaceholder({ slot, style, minHeight, quiet, fill }: Props) {
  const showPlay = slot.kind === 'video' && !quiet;
  const videoUri = slot.kind === 'video' ? resolveAssetUri(slot.src) : null;
  const posterSource = toImageSource(slot.poster ?? (slot.kind === 'image' ? slot.src : null));
  const imageSource = slot.kind === 'image' ? toImageSource(slot.src) : posterSource;
  const playVideoOnWeb = Platform.OS === 'web' && slot.kind === 'video' && Boolean(videoUri);

  return (
    <View
      style={[
        styles.root,
        fill && styles.rootFill,
        minHeight != null && { minHeight },
        style,
      ]}
    >
      {playVideoOnWeb ? (
        <StorefrontWebVideo src={videoUri!} poster={posterSource} />
      ) : imageSource ? (
        <Image source={imageSource} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, quiet && styles.placeholderQuiet]}>
          {!quiet ? (
            <>
              <Text style={styles.label}>{slot.label}</Text>
              <Text style={styles.hint}>
                {slot.kind === 'video' ? 'Video placeholder' : 'Photo placeholder'}
              </Text>
            </>
          ) : null}
        </View>
      )}
      {showPlay && !playVideoOnWeb ? (
        <View style={styles.playBadge} accessibilityElementsHidden>
          <Icon icon={icons.play} size={18} color={semanticColors.textInverse} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: semanticColors.accentCream,
    borderWidth: 1,
    borderColor: semanticColors.brand,
    borderRadius: borderRadius.md,
    position: 'relative',
    aspectRatio: 16 / 9,
  },
  rootFill: {
    // Clear the default 16/9 so absolute-fill can match the parent frame.
    ...({ aspectRatio: 'auto' } as object),
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    // Web: cover; bottom-bias keeps product/table in frame over faces when cropped.
    ...({ objectFit: 'cover', objectPosition: 'center bottom' } as object),
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: semanticColors.accentCream,
  },
  placeholderQuiet: {
    backgroundColor: '#E8DFD0',
  },
  label: {
    ...typeface('medium'),
    fontSize: typography.md,
    color: semanticColors.logoDark,
    textAlign: 'center',
  },
  hint: {
    ...typeface('regular'),
    fontSize: typography.sm,
    color: semanticColors.goldMuted,
    textAlign: 'center',
  },
  playBadge: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(17, 2, 34, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    top: '50%',
    marginTop: -24,
    left: '50%',
    marginLeft: -24,
  },
});
