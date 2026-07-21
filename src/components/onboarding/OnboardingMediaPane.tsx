import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  Platform,
  type ImageSourcePropType,
} from 'react-native';
import { colors } from '../../constants/theme';
import { HOME_HOLIDAY_THUMBS } from '../../constants/homeImages';

/** Matches HomeHeroCard — deep indigo scrim over the photo, heavy at the copy seam. */
const MEDIA_HERO_SCRIM = colors.purple[500];
const MEDIA_HERO_SCRIM_GRADIENT =
  Platform.OS === 'web'
    ? (`linear-gradient(90deg, rgba(9, 1, 19, 0.92) 0%, rgba(9, 1, 19, 0.55) 42%, rgba(9, 1, 19, 0.18) 72%, rgba(9, 1, 19, 0) 100%)` as const)
    : null;
const MEDIA_GOLD_WASH = 'rgba(216, 201, 144, 0.38)';

const DESKTOP_PANE_SHARE = '50%';

type Props = {
  source?: ImageSourcePropType;
  /** Fill the transition shell edge-to-edge (image stays full size while copy overlaps). */
  fillParent?: boolean;
};

/** Desktop onboarding right pane — photo + gold wash + indigo scrim. */
export function OnboardingMediaPane({
  source = HOME_HOLIDAY_THUMBS.hanukkah,
  fillParent = false,
}: Props) {
  return (
    <View
      style={[styles.mediaPane, fillParent && styles.mediaPaneFill]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={source}
        style={styles.mediaImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View
        pointerEvents="none"
        style={[
          styles.goldWash,
          Platform.OS === 'web' ? ({ mixBlendMode: 'soft-light' } as object) : null,
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          Platform.OS === 'web' && MEDIA_HERO_SCRIM_GRADIENT
            ? ({ backgroundImage: MEDIA_HERO_SCRIM_GRADIENT } as object)
            : { backgroundColor: MEDIA_HERO_SCRIM, opacity: 0.55 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mediaPane: {
    flex: 1,
    flexBasis: DESKTOP_PANE_SHARE,
    width: DESKTOP_PANE_SHARE,
    maxWidth: DESKTOP_PANE_SHARE,
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    position: 'relative',
    zIndex: 1,
    overflow: 'hidden',
    backgroundColor: MEDIA_HERO_SCRIM,
  },
  mediaPaneFill: {
    flexBasis: 'auto',
    width: '100%',
    maxWidth: '100%',
    height: '100%',
  },
  mediaImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  goldWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: MEDIA_GOLD_WASH,
  },
});
