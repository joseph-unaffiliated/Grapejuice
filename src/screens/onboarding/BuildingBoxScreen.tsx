import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import {
  OnboardingBuildLoader,
  BUILD_LOADER_REST_MESSAGE,
} from '../../components/onboarding/OnboardingBuildLoader';
import { MobileButton } from '../../components/mobile/MobileButton';
import { m, mFont } from '../../components/mobile/mobileTheme';
import { semanticColors } from '../../constants/theme';

type Props = {
  onComplete: () => void;
  /** Design preview — keep cycling copy but do not advance to box reveal. */
  hold?: boolean;
  /** Box data is ready; advance to the reveal once the minimum splash elapses. */
  ready?: boolean;
  /** Calm inline explanation when the save is slow or failed. Stays on this screen. */
  notice?: string | null;
  /** Shown with `notice`, or once this screen has been waiting a while. */
  onRetry?: () => void;
};

const BUILD_STEPS = [
  'Getting your box started…',
  'Matching stories to ages…',
  'Picking treats and candles…',
  'Asking Rav to look over the picks…',
  BUILD_LOADER_REST_MESSAGE,
];

const MESSAGE_INTERVAL_MS = 2200;
/** Long enough to read one line. The save itself is not delayed past this. */
const MIN_SPLASH_MS = 900;
/** Stay here and explain — never leave for an earlier questionnaire step. */
const SLOW_AFTER_MS = 12000;

const SLOW_COPY = 'This is taking a moment. Your answers are saved on this device.';

/**
 * Loader splash. Renders bare (no screen chrome), centered in the onboarding body.
 * Mounts the moment the build starts; advances once the box is `ready` and the
 * short splash has elapsed. A slow or failed save stays on this screen.
 */
export function BuildingBoxScreen({ onComplete, hold = false, ready = true, notice = null, onRetry }: Props) {
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  const mountedAt = useRef(Date.now());
  const [stepIndex, setStepIndex] = useState(0);
  const [slow, setSlow] = useState(false);

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
    if (hold || !ready || notice) return;
    const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - mountedAt.current));
    const doneTimer = setTimeout(() => onCompleteRef.current(), wait);
    return () => clearTimeout(doneTimer);
  }, [hold, ready, notice]);

  useEffect(() => {
    if (hold || ready || notice) return;
    const cap = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(cap);
  }, [hold, ready, notice]);

  const noticeText = notice || (slow ? SLOW_COPY : null);

  return (
    <View style={styles.fill}>
      <Animated.View style={{ opacity: contentOpacity }}>
        <OnboardingBuildLoader message={BUILD_STEPS[stepIndex]} />
      </Animated.View>
      {noticeText ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{noticeText}</Text>
          {onRetry ? (
            <View style={styles.retry}>
              <MobileButton label="Try again" onPress={onRetry} />
            </View>
          ) : null}
        </View>
      ) : null}
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
  notice: {
    marginTop: 28,
    maxWidth: 360,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  noticeText: {
    ...mFont(400),
    fontSize: 15,
    lineHeight: 22,
    color: m.goldDark,
    textAlign: 'center',
  },
  retry: {
    marginTop: 16,
    width: 220,
  },
});
