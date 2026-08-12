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
 *
 * Under storefront chrome both panes are static flex children of the fill body
 * (no absolute / 100vh), so the split sits below the header and fits the leftover
 * viewport.
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

  const mediaWidth = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [DESKTOP_PANE_SHARE, '0%'],
  });

  const buildingScrimOpacity = expand.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.25, 0.92],
  });

  return (
    <OnboardingMediaHostContext.Provider
      value={{ hosted: true, buildingTransition: buildingPhase }}
    >
      <View
        style={[
          styles.host,
          underStorefrontChrome ? styles.hostUnderChrome : styles.hostViewport,
        ]}
      >
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
              width: mediaWidth,
              maxWidth: mediaWidth,
              flexBasis: mediaWidth,
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
  },
  /** Full-viewport shell when onboarding is the root (no storefront header). */
  hostViewport: {
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100vh' } as object)
      : null),
  },
  /** Fill the chrome body slot — height comes from flex, not the viewport. */
  hostUnderChrome: {
    ...(Platform.OS === 'web'
      ? ({ height: '100%', maxHeight: '100%', alignSelf: 'stretch' } as object)
      : null),
  },
  copySlot: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    /** Fill the pane so the primary CTA can pin to the bottom. */
    justifyContent: 'flex-start',
    zIndex: 2,
    backgroundColor: semanticColors.bgPrimary,
  },
  /** Loader tracks the widening column — centered content shifts toward page center. */
  copySlotLoader: {
    justifyContent: 'center',
  },
  /** Static right pane (participates in flex flow under the header). */
  mediaShell: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    zIndex: 1,
    position: 'relative',
  },
  buildingScrim: {
    backgroundColor: BUILDING_SCRIM,
  },
});
