import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOBILE_GUTTER, spacing } from '../../constants/theme';
import { useWebLayout } from '../../hooks/useWebLayout';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { useOnboardingUnderStorefrontChrome } from './onboardingChromeContext';

/** Matches copy pane horizontal inset — logo lines up with title/body below. */
export const DESKTOP_COPY_HORIZONTAL_PAD = spacing.xxl + spacing.lg;
export const ONBOARDING_LOGO_TOP_WEB = spacing.lg;

/**
 * Fixed top-left grape mark for onboarding. Pinned to the viewport on web so
 * vertical centering in the copy column never moves it.
 * Hidden when the wizard sits under storefront chrome (header already brands).
 */
export function OnboardingCornerLogo() {
  const underStorefrontChrome = useOnboardingUnderStorefrontChrome();
  const insets = useSafeAreaInsets();
  const { tier } = useWebLayout();
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';

  if (underStorefrontChrome) return null;
  const logoTop =
    Platform.OS === 'web' ? ONBOARDING_LOGO_TOP_WEB : Math.max(insets.top, spacing.sm) + spacing.sm;
  const logoLeft = isDesktopWeb
    ? DESKTOP_COPY_HORIZONTAL_PAD
    : Platform.OS === 'web'
      ? spacing.lg
      : MOBILE_GUTTER;

  return (
    <View
      style={[
        styles.corner,
        Platform.OS === 'web' ? styles.cornerWebFixed : null,
        { top: logoTop, left: logoLeft },
      ]}
      pointerEvents="none"
    >
      <GrapejuiceBrandMark markOnly align="left" decorative />
    </View>
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
