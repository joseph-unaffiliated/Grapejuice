import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, ActivityIndicator } from 'react-native';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography } from '../../constants/theme';

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
  const [stepIndex, setStepIndex] = React.useState(0);

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: useNative }).start();

    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i < BUILD_STEPS.length - 1 ? i + 1 : i));
    }, 700);

    const doneTimer = setTimeout(onComplete, 2800);

    return () => {
      clearInterval(stepTimer);
      clearTimeout(doneTimer);
    };
  }, [fade, onComplete]);

  return (
    <WebPageContainer style={styles.wrapper}>
      <Animated.View style={[styles.root, { opacity: fade }]}>
        <ActivityIndicator size="large" color={semanticColors.brand} />
        <Text style={styles.title}>Building your box</Text>
        <Text style={styles.step}>{BUILD_STEPS[stepIndex]}</Text>
        <Text style={styles.body}>
          We are curating candles, treats, kid picks, and a printed guide — matched to what you told us.
        </Text>
      </Animated.View>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: semanticColors.bgPrimary },
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: 24, fontWeight: '700', color: semanticColors.textPrimary, marginTop: spacing.xl },
  step: { fontSize: typography.lg, color: semanticColors.goldMuted, marginTop: spacing.md },
  body: {
    fontSize: typography.md,
    color: semanticColors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 20,
    maxWidth: 320,
  },
});
