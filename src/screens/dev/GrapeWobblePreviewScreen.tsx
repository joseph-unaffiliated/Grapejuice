import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  GrapejuiceLogomarkSvg,
  LOGOMARK_ASPECT,
  DEFAULT_GRAPE_WOBBLE,
  type GrapePulseMode,
  type GrapeWobbleTune,
} from '../../components/brand/GrapejuiceLogomarkSvg';
import { typography, spacing } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

type KnobProps = {
  label: string;
  display: string;
  onDec: () => void;
  onInc: () => void;
  colors: SemanticColors;
};

function Knob({ label, display, onDec, onInc, colors }: KnobProps) {
  return (
    <View style={styles.knob}>
      <Text style={[styles.knobLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.knobRow}>
        <TouchableOpacity style={[styles.knobBtn, { borderColor: colors.border }]} onPress={onDec}>
          <Text style={[styles.knobBtnText, { color: colors.textPrimary }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.knobValue, { color: colors.textPrimary }]}>{display}</Text>
        <TouchableOpacity style={[styles.knobBtn, { borderColor: colors.border }]} onPress={onInc}>
          <Text style={[styles.knobBtnText, { color: colors.textPrimary }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Dev-only: large grape mark + live wobble knobs. Open via `?preview=grape-wobble`. */
export function GrapeWobblePreviewScreen() {
  const { colors } = useThemeMode();
  const [animating, setAnimating] = useState(true);
  const [size, setSize] = useState(220);
  const [ampScale, setAmpScale] = useState(DEFAULT_GRAPE_WOBBLE.ampScale);
  const [speedScale, setSpeedScale] = useState(DEFAULT_GRAPE_WOBBLE.speedScale);
  const [pauseMs, setPauseMs] = useState(DEFAULT_GRAPE_WOBBLE.pauseMs);
  const [pulseMode, setPulseMode] = useState<GrapePulseMode>(DEFAULT_GRAPE_WOBBLE.pulseMode);
  const [pulseDepth, setPulseDepth] = useState(DEFAULT_GRAPE_WOBBLE.pulseDepth);
  const [squash, setSquash] = useState(DEFAULT_GRAPE_WOBBLE.squash);

  const wobble: GrapeWobbleTune = useMemo(
    () => ({ ampScale, speedScale, pauseMs, pulseMode, pulseDepth, squash }),
    [ampScale, speedScale, pauseMs, pulseMode, pulseDepth, squash],
  );

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgPrimary }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Grape wobble tuner</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Rotate + size pulse + squash/stretch. Sequence walks top-left → right → down. Alternating
          berries flatten horizontal-first vs vertical-first.
        </Text>

        <View style={styles.stage}>
          <GrapejuiceLogomarkSvg
            width={size}
            height={size / LOGOMARK_ASPECT}
            color={colors.textPrimary}
            animating={animating}
            wobble={wobble}
          />
          <View style={styles.sizeCompare}>
            <GrapejuiceLogomarkSvg
              width={16}
              height={16 / LOGOMARK_ASPECT}
              color={colors.textPrimary}
              animating={animating}
              wobble={wobble}
            />
            <Text style={[styles.compareLabel, { color: colors.textSecondary }]}>footer size</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.toggle, { borderColor: colors.brand }]}
          onPress={() => setAnimating((v) => !v)}
        >
          <Text style={[styles.toggleText, { color: colors.textPrimary }]}>
            {animating ? 'Pause animation' : 'Play animation'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.knobLabel, { color: colors.textSecondary }]}>Pulse order</Text>
        <View style={styles.segmentRow}>
          {([
            ['sequence', 'Sequence'],
            ['random', 'Random'],
          ] as const).map(([mode, label]) => {
            const active = pulseMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.segment,
                  {
                    borderColor: active ? colors.brand : colors.border,
                    backgroundColor: active ? colors.bgElevated : 'transparent',
                  },
                ]}
                onPress={() => setPulseMode(mode)}
              >
                <Text style={[styles.segmentText, { color: colors.textPrimary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Knob
          label="Size"
          display={`${size}px`}
          onDec={() => setSize((s) => Math.max(64, s - 20))}
          onInc={() => setSize((s) => Math.min(420, s + 20))}
          colors={colors}
        />
        <Knob
          label="Tilt amplitude"
          display={`${round1(ampScale)}×`}
          onDec={() => setAmpScale((v) => round1(Math.max(0.2, v - 0.1)))}
          onInc={() => setAmpScale((v) => round1(Math.min(3, v + 0.1)))}
          colors={colors}
        />
        <Knob
          label="Pulse depth (shrink)"
          display={`${round2(pulseDepth)}`}
          onDec={() => setPulseDepth((v) => round2(Math.max(0, v - 0.05)))}
          onInc={() => setPulseDepth((v) => round2(Math.min(0.85, v + 0.05)))}
          colors={colors}
        />
        <Knob
          label="Squash (axis flatten)"
          display={`${round2(squash)}`}
          onDec={() => setSquash((v) => round2(Math.max(0, v - 0.05)))}
          onInc={() => setSquash((v) => round2(Math.min(1, v + 0.05)))}
          colors={colors}
        />
        <Knob
          label="Speed"
          display={`${round1(speedScale)}×`}
          onDec={() => setSpeedScale((v) => round1(Math.max(0.3, v - 0.1)))}
          onInc={() => setSpeedScale((v) => round1(Math.min(3, v + 0.1)))}
          colors={colors}
        />
        <Knob
          label="Pause between cycles"
          display={`${pauseMs}ms`}
          onDec={() => setPauseMs((v) => Math.max(0, v - 20))}
          onInc={() => setPauseMs((v) => Math.min(600, v + 20))}
          colors={colors}
        />

        <Text style={[styles.code, { color: colors.textSecondary, backgroundColor: colors.bgElevated }]}>
          {`ampScale: ${round1(ampScale)}, speedScale: ${round1(speedScale)}, pauseMs: ${pauseMs}, pulseMode: '${pulseMode}', pulseDepth: ${round2(pulseDepth)}, squash: ${round2(squash)}`}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: typography.xl, fontWeight: '600', letterSpacing: -0.4 },
  sub: { fontSize: typography.md, lineHeight: 20, letterSpacing: -0.2 },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.lg,
    minHeight: 320,
  },
  sizeCompare: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compareLabel: { fontSize: typography.sm },
  toggle: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  toggleText: { fontSize: typography.md, letterSpacing: -0.2 },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentText: { fontSize: typography.md, letterSpacing: -0.2 },
  knob: { gap: spacing.xs },
  knobLabel: { fontSize: typography.sm, letterSpacing: -0.2 },
  knobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  knobBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobBtnText: { fontSize: 22, lineHeight: 24 },
  knobValue: { minWidth: 72, textAlign: 'center', fontSize: typography.lg, letterSpacing: -0.3 },
  code: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: typography.sm,
  },
});
