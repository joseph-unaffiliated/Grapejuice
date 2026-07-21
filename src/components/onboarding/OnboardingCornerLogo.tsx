import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOBILE_GUTTER, spacing } from '../../constants/theme';
import { useWebLayout } from '../../hooks/useWebLayout';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { useOnboardingBuildingTransition } from './onboardingMediaHostContext';

/** Matches copy pane horizontal inset — logo lines up with title/body below. */
export const DESKTOP_COPY_HORIZONTAL_PAD = spacing.xxl + spacing.lg;
export const ONBOARDING_LOGO_TOP_WEB = spacing.lg;

/**
 * Fixed top-left grape mark for onboarding. Pinned to the viewport on web so
 * vertical centering in the copy column never moves it.
 */
export function OnboardingCornerLogo() {
  const insets = useSafeAreaInsets();
  const { tier } = useWebLayout();
  const buildingTransition = useOnboardingBuildingTransition();
  const logoOpacity = useRef(new Animated.Value(buildingTransition ? 0 : 1)).current;
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';

  useEffect(() => {
    Animated.timing(logoOpacity, {
      toValue: buildingTransition ? 0 : 1,
      duration: buildingTransition ? 280 : 200,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [buildingTransition, logoOpacity]);

  const logoTop =
    Platform.OS === 'web' ? ONBOARDING_LOGO_TOP_WEB : Math.max(insets.top, spacing.sm) + spacing.sm;
  const logoLeft = isDesktopWeb
    ? DESKTOP_COPY_HORIZONTAL_PAD
    : Platform.OS === 'web'
      ? spacing.lg
      : MOBILE_GUTTER;

  return (
    <Animated.View
      style={[
        styles.corner,
        Platform.OS === 'web' ? styles.cornerWebFixed : null,
        { top: logoTop, left: logoLeft, opacity: logoOpacity },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden={buildingTransition}
    >
      <GrapejuiceBrandMark markOnly align="left" decorative />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    zIndex: 20,
  },
  cornerWebFixed: {
    position: 'fixed',
  } as object,
});
