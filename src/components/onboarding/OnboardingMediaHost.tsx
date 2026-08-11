import React, { useEffect, useRef, type ReactNode } from 'react';
import { View, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { useWebLayout } from '../../hooks/useWebLayout';
import { colors, semanticColors } from '../../constants/theme';
import { OnboardingMediaPane } from './OnboardingMediaPane';
import { OnboardingCornerLogo } from './OnboardingCornerLogo';
import { OnboardingMediaHostContext } from './onboardingMediaHostContext';
import { useOnboardingUnderStorefrontChrome } from './onboardingChromeContext';

export { useOnboardingMediaHost, useOnboardingBuildingTransition } from './onboardingMediaHostContext';

const DESKTOP_PANE_SHARE = '50%';
const BUILDING_EXPAND_MS = 620;
const MEDIA_SHIFT_PX = 48;
/** Deep indigo — matches hero scrim / media pane base. */
const BUILDING_SCRIM = colors.purple[500];

type Props = {
  children: ReactNode;
  /** Expand copy over media (starts on Build CTA while catalog loads). */
  buildingPhase?: boolean;
  /** Vertically center copy while the loader runs (building step only). */
  buildingLoader?: boolean;
};

/**
 * Keeps the desktop holiday photo mounted across onboarding step transitions so
 * the browser does not reload the same asset on every screen change.
 */
export function OnboardingMediaHost({
  children,
  buildingPhase = false,
  buildingLoader = false,
}: Props) {
  const { tier } = useWebLayout();
  const underStorefrontChrome = useOnboardingUnderStorefrontChrome();
  const isDesktopWeb = Platform.OS === 'web' && tier === 'desktop-web';
  const expand = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(expand, {
      toValue: buildingPhase ? 1 : 0,
      duration: BUILDING_EXPAND_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [buildingPhase, expand]);

  if (!isDesktopWeb) {
    return <>{children}</>;
  }

  const copyWidth = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [DESKTOP_PANE_SHARE, '100%'],
  });

  const buildingScrimOpacity = expand.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.25, 0.92],
  });

  const mediaTranslateX = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MEDIA_SHIFT_PX],
  });

  return (
    <OnboardingMediaHostContext.Provider
      value={{ hosted: true, buildingTransition: buildingPhase }}
    >
      <View style={[styles.host, underStorefrontChrome && styles.hostUnderChrome]}>
        <OnboardingCornerLogo />
        <Animated.View
          style={[
            styles.copySlot,
            buildingLoader ? styles.copySlotLoader : null,
            {
              width: copyWidth,
              maxWidth: copyWidth,
              flexBasis: copyWidth,
            },
          ]}
        >
          {children}
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.mediaShell,
            {
              transform: [{ translateX: mediaTranslateX }],
            },
          ]}
        >
          <OnboardingMediaPane fillParent />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.buildingScrim,
              { opacity: buildingScrimOpacity },
            ]}
          />
        </Animated.View>
      </View>
    </OnboardingMediaHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    backgroundColor: semanticColors.bgPrimary,
    width: '100%',
    minHeight: 0,
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  hostUnderChrome: {
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%' } as object)
      : null),
  },
  copySlot: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    /** Vertically center the copy+CTA block in the left pane (short intro steps). */
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: semanticColors.bgPrimary,
  },
  /** Loader tracks the widening column — centered content shifts toward page center. */
  copySlotLoader: {
    justifyContent: 'center',
  },
  mediaShell: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DESKTOP_PANE_SHARE,
    zIndex: 1,
  },
  buildingScrim: {
    backgroundColor: BUILDING_SCRIM,
  },
});
