import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, PanResponder, LayoutChangeEvent } from 'react-native';
import type { FamiliarityLevel } from '../../types/pilot';
import { WebPageContainer } from '../../components/ui/WebPageContainer';
import { semanticColors, spacing, typography, borderRadius, shadowsWeb } from '../../constants/theme';
import { familiarityScoreToLevel } from '../../stores/guestSessionStore';

type Props = {
  initialScore?: number;
  onContinue: (level: FamiliarityLevel, score: number) => void;
};

function FamiliaritySliderControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);

  const setFromX = (x: number) => {
    if (trackWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    onChange(Math.round(ratio * 100));
  };

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
    onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
  });

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);
  const thumbLeft = trackWidth > 0 ? (value / 100) * trackWidth - 12 : 0;

  return (
    <View style={styles.sliderWrap}>
      <View style={styles.track} onLayout={onLayout} {...pan.panHandlers}>
        <View style={[styles.fill, { width: `${value}%` }]} />
        <View style={[styles.thumb, { left: Math.max(0, Math.min(trackWidth - 24, thumbLeft)) }]} />
      </View>
      <View style={styles.stepRow}>
        {[0, 25, 50, 75, 100].map((step) => (
          <TouchableOpacity key={step} onPress={() => onChange(step)} style={styles.stepBtn}>
            <View style={[styles.stepDot, value >= step - 5 && value <= step + 5 && styles.stepDotOn]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function FamiliaritySliderScreen({ initialScore = 50, onContinue }: Props) {
  const [score, setScore] = useState(initialScore);
  const level = familiarityScoreToLevel(score);

  const levelHint =
    level === 'minimal'
      ? 'We will keep it simple — candles, one treat, low pressure.'
      : level === 'moderate'
        ? 'A few traditions, room to breathe.'
        : 'Full eight nights — we will match that energy.';

  return (
    <WebPageContainer authCard style={styles.wrapper}>
      <View style={styles.root}>
        <Text style={styles.title}>How does Hanukkah usually go?</Text>
        <Text style={styles.subtitle}>
          Slide to where you are — not where you think you should be. This shapes your box and your guide.
        </Text>

        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Our first Hanukkah</Text>
          <Text style={[styles.sliderLabel, styles.sliderLabelRight]}>We do all eight nights</Text>
        </View>

        <FamiliaritySliderControl value={score} onChange={setScore} />

        <Text style={styles.hint}>{levelHint}</Text>

        <TouchableOpacity
          style={[styles.cta, Platform.OS === 'web' ? { boxShadow: shadowsWeb.goldGlow } : undefined]}
          onPress={() => onContinue(level, score)}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </WebPageContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  root: { flex: 1, padding: spacing.lg, paddingTop: spacing.xxl, backgroundColor: semanticColors.bgPrimary },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: typography.lg, color: semanticColors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  sliderLabel: { fontSize: typography.sm, color: semanticColors.textSecondary, flex: 1 },
  sliderLabelRight: { textAlign: 'right' },
  sliderWrap: { marginVertical: spacing.md },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: semanticColors.border,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: semanticColors.brand,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: semanticColors.brand,
    top: -8,
    borderWidth: 2,
    borderColor: semanticColors.bgPrimary,
  },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  stepBtn: { padding: spacing.xs },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semanticColors.border },
  stepDotOn: { backgroundColor: semanticColors.brand },
  hint: {
    fontSize: typography.md,
    color: semanticColors.goldMuted,
    marginTop: spacing.lg,
    lineHeight: 20,
    textAlign: 'center',
  },
  cta: {
    backgroundColor: semanticColors.brand,
    padding: spacing.md,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  ctaText: { fontWeight: '700', color: semanticColors.textInverse },
});
