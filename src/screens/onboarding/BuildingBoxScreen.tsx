import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, ActivityIndicator } from 'react-native';
import {
  OnboardingScreenLayout,
  onboardingBodyText,
} from '../../components/onboarding/OnboardingScreenLayout';
import { semanticColors, spacing, typography, typeface } from '../../constants/theme';

type Props = {
  onComplete: () => void;
};

const BUILD_STEPS = [
  'Reading your family…',
  'Matching stories to ages…',
  'Picking treats and candles…',
  'Almost there…',
];

export function BuildingBoxScreen({ onComplete }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  const [stepIndex, setStepIndex] = React.useState(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: useNative }).start();

    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i < BUILD_STEPS.length - 1 ? i + 1 : i));
    }, 700);

    const doneTimer = setTimeout(() => onCompleteRef.current(), 2800);

    return () => {
      clearInterval(stepTimer);
      clearTimeout(doneTimer);
    };
  }, [fade]);

  return (
    <OnboardingScreenLayout title="Building your box" hideFooter>
      <Animated.View style={[styles.root, { opacity: fade }]}>
        <ActivityIndicator size="large" color={semanticColors.brand} />
        <Text style={styles.step}>{BUILD_STEPS[stepIndex]}</Text>
        <Text style={[onboardingBodyText.text, styles.body]}>
          We are curating candles, treats, kid picks, and a printed guide — matched to what you told us.
        </Text>
      </Animated.View>
    </OnboardingScreenLayout>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  step: {
    ...typeface('regular'),
    fontSize: typography.lg,
    color: semanticColors.goldMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 320,
  },
});
