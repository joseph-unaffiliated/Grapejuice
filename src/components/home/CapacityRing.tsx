import React, { useId } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Path,
} from 'react-native-svg';
import { semanticColors, typography } from '../../constants/theme';

type Props = {
  percent: number;
  size?: number;
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Figma 370:3400 — thick cream track, inset gold arc, recessed white center. */
export function CapacityRing({ percent, size = 77 }: Props) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  const gradId = useId().replace(/:/g, '');

  const cx = size / 2;
  const cy = size / 2;
  const trackRadius = 30;
  const trackStroke = 10;
  const progressRadius = 27.5;
  const progressStroke = 5;
  const innerRadius = 23;
  const innerDiscSize = innerRadius * 2;

  const startDeg = 90;
  const sweepDeg = (clamped / 100) * 360;
  const endDeg = startDeg + sweepDeg;
  const start = polar(cx, cy, progressRadius, startDeg);
  const end = polar(cx, cy, progressRadius, endDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  const arcPath =
    clamped <= 0
      ? ''
      : clamped >= 100
        ? `M ${start.x} ${start.y} A ${progressRadius} ${progressRadius} 0 1 1 ${start.x - 0.01} ${start.y}`
        : `M ${start.x} ${start.y} A ${progressRadius} ${progressRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`;

  const shadowStyle =
    Platform.OS === 'web'
      ? ({ filter: 'drop-shadow(0px 3px 8px rgba(0, 0, 0, 0.12))' } as object)
      : {};

  const innerDiscWebStyle =
    Platform.OS === 'web'
      ? ({
          boxShadow: 'inset 0px 2px 8px rgba(0, 0, 0, 0.14)',
        } as object)
      : null;

  return (
    <View style={[styles.wrap, { width: size, height: size }, shadowStyle]}>
      {Platform.OS === 'web' ? (
        <View
          pointerEvents="none"
          style={[
            styles.innerDisc,
            {
              width: innerDiscSize,
              height: innerDiscSize,
              borderRadius: innerRadius,
              left: cx - innerRadius,
              top: cy - innerRadius,
            },
            innerDiscWebStyle,
          ]}
        />
      ) : null}

      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#E8DDB0" />
            <Stop offset="45%" stopColor={semanticColors.brand} />
            <Stop offset="100%" stopColor={semanticColors.goldMuted} />
          </LinearGradient>
        </Defs>

        {/* Recessed white center — native only; web uses CSS inset shadow overlay */}
        {Platform.OS !== 'web' ? (
          <Circle
            cx={cx}
            cy={cy}
            r={innerRadius}
            fill={semanticColors.bgPrimary}
            stroke="rgba(0, 0, 0, 0.06)"
            strokeWidth={1}
          />
        ) : null}

        {/* Thick cream track groove */}
        <Circle
          cx={cx}
          cy={cy}
          r={trackRadius}
          stroke={semanticColors.accentCream}
          strokeWidth={trackStroke}
          fill="none"
        />

        {/* Inset gold progress arc — narrower stroke on smaller radius */}
        {arcPath ? (
          <Path
            d={arcPath}
            stroke={`url(#${gradId})`}
            strokeWidth={progressStroke}
            strokeLinecap="round"
            fill="transparent"
          />
        ) : null}
      </Svg>

      <View style={styles.labelWrap} pointerEvents="none">
        <Text style={styles.label}>{clamped}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible' as const,
  },
  innerDisc: {
    position: 'absolute',
    backgroundColor: semanticColors.bgPrimary,
  },
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.lg,
    fontWeight: '400',
    color: semanticColors.textPrimary,
    letterSpacing: -0.26,
  },
});
