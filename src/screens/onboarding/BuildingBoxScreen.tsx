import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import {
  OnboardingBuildLoader,
  BUILD_LOADER_REST_MESSAGE,
} from '../../components/onboarding/OnboardingBuildLoader';
import { semanticColors } from '../../constants/theme';

type Props = {
  onComplete: () => void;
  /** Design preview — keep cycling copy but do not advance to box reveal. */
  hold?: boolean;
  /** Box data is ready; advance to the reveal once the minimum splash elapses. */
  ready?: boolean;
};

const BUILD_STEPS = [
  'Reading your family…',
  'Matching stories to ages…',
  'Picking treats and candles…',
  BUILD_LOADER_REST_MESSAGE,
];

const MESSAGE_INTERVAL_MS = 700;
/** Hold the splash long enough to read, even when the box builds instantly. */
const MIN_SPLASH_MS = 2200;

/**
 * Loader splash. Renders bare (no screen chrome) so it centers within the
 * onboarding left pane and tracks the pane as it expands to full width.
 * Mounts the moment the build starts so it rides the expansion; advances to
 * the reveal once the box data is `ready` and the minimum splash has elapsed.
 * The corner logo is faded out by the building transition, so it is omitted here.
 */
export function BuildingBoxScreen({ onComplete, hold = false, ready = true }: Props) {
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  const mountedAt = useRef(Date.now());
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 320,
      useNativeDriver: useNative,
    }).start();

    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i < BUILD_STEPS.length - 1 ? i + 1 : i));
    }, MESSAGE_INTERVAL_MS);

    return () => clearInterval(stepTimer);
  }, [contentOpacity]);

  useEffect(() => {
    if (hold || !ready) return;
    const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - mountedAt.current));
    const doneTimer = setTimeout(() => onCompleteRef.current(), wait);
    return () => clearTimeout(doneTimer);
  }, [hold, ready]);

  return (
    <View style={styles.fill}>
      <Animated.View style={{ opacity: contentOpacity }}>
        <OnboardingBuildLoader message={BUILD_STEPS[stepIndex]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.bgPrimary,
    minHeight: 0,
  },
});
