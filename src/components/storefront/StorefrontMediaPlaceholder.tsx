import React from 'react';
import { View, Text, StyleSheet, Image, type StyleProp, type ViewStyle } from 'react-native';
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

/** Cream/gold frame until lifestyle assets exist (`slot.src`). */
export function StorefrontMediaPlaceholder({ slot, style, minHeight, quiet, fill }: Props) {
  const showPlay = slot.kind === 'video' && !quiet;
  const imageSource =
    slot.src == null
      ? null
      : typeof slot.src === 'string'
        ? { uri: slot.src }
        : slot.src;

  return (
    <View
      style={[
        styles.root,
        fill && styles.rootFill,
        minHeight != null && { minHeight },
        style,
      ]}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
        />
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
      {showPlay ? (
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
    ...( { aspectRatio: 'auto' } as object),
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    // Web: explicit cover + center (resizeMode alone can look like contain).
    ...( { objectFit: 'cover', objectPosition: 'center' } as object),
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
