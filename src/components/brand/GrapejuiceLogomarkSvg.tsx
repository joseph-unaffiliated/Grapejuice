import React, { useEffect } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Intrinsic SVG ratio from the brand file (1487 × 1360). */
export const LOGOMARK_ASPECT = 1487 / 1360;

const AnimatedG = Animated.createAnimatedComponent(G);

export type GrapePulseMode = 'sequence' | 'random';

/** Live-tunable knobs for the Rav thinking wobble. */
export type GrapeWobbleTune = {
  /** Multiplier on per-grape tilt amplitude. Default 1. */
  ampScale?: number;
  /** Multiplier on motion speed (higher = snappier). Default 1. */
  speedScale?: number;
  /** Extra pause between wobble cycles (ms). Default 180. */
  pauseMs?: number;
  /**
   * Size pulse order.
   * - sequence: top-left → across → down → loop
   * - random: each berry on its own irregular cycle
   */
  pulseMode?: GrapePulseMode;
  /** How far grapes shrink (0 = none, 1 = disappear). Default 0.4 → scale ≈ 0.6. */
  pulseDepth?: number;
  /**
   * Non-uniform squash on top of the pulse (0 = round shrink/grow, 1 = hard oval flatten).
   * Alternating berries squash horizontal-first vs vertical-first.
   */
  squash?: number;
};

export const DEFAULT_GRAPE_WOBBLE: Required<GrapeWobbleTune> = {
  ampScale: 2.1,
  speedScale: 0.7,
  pauseMs: 0,
  pulseMode: 'sequence',
  pulseDepth: 0.3,
  squash: 0.1,
};

type Props = {
  width?: number;
  height?: number;
  color?: string;
  /** Wobbly per-grape rotation while Rav (or similar) is thinking. */
  animating?: boolean;
  /** Override timing / amplitude (preview + tuning). */
  wobble?: GrapeWobbleTune;
};

type Grape = {
  d: string;
  /** Rotation / scale pivot in viewBox coordinates (approx. berry center). */
  cx: number;
  cy: number;
  /** Stagger for rotation so berries don't tilt in lockstep. */
  delayMs: number;
  /** Peak tilt — slight variance reads more hand-drawn. */
  amp: number;
  /** Stable “random” seeds for random pulse mode. */
  randomOffsetMs: number;
  randomPauseMs: number;
};

/** Reading order: top L→R, then mid L→R, then bottom. */
const GRAPES: Grape[] = [
  {
    // top-left
    d: 'M272.014 51.1484C275.678 50.949 279.348 50.8919 283.017 50.9773C393.529 53.121 472.842 137.744 469.752 248.301C468.204 312.541 441.278 373.553 394.863 417.991C355.307 455.309 311.352 472.08 257.255 470.572C154.411 465.261 62.2908 376.644 58.6155 273.022C56.6487 217.569 77.0148 162.212 113.992 120.89C154.541 75.5777 212.317 54.0367 272.014 51.1484Z',
    cx: 270,
    cy: 260,
    delayMs: 0,
    amp: 16,
    randomOffsetMs: 0,
    randomPauseMs: 220,
  },
  {
    // top-center
    d: 'M714.024 50.3962C780.486 46.9519 850.022 78.0632 898.727 122.17C938.494 158.18 958.607 204.418 960.465 257.792C962.375 312.767 948.216 366.324 909.749 407.303C876.538 442.746 825.989 467.134 778.177 474.534C768.6 476.015 757.223 476.269 747.493 476.572C680.024 475.164 612.603 444.766 561.22 401.635C523.398 369.886 502.185 324.713 499.133 275.503C495.432 221.578 513.794 168.464 550.009 128.34C593.756 79.0565 648.699 54.3125 714.024 50.3962Z',
    cx: 730,
    cy: 265,
    delayMs: 40,
    amp: 13,
    randomOffsetMs: 140,
    randomPauseMs: 310,
  },
  {
    // top-right
    d: 'M1189.85 34.4272C1245.18 28.4193 1304.65 55.1513 1345.27 91.4707C1392.24 133.098 1420.48 191.878 1423.62 254.562C1427.61 330.509 1392.63 419.036 1324.87 458.643C1297 474.933 1262.4 485.537 1230.15 487.115C1219.9 487.212 1208.54 487.499 1198.37 486.722C1159.71 483.925 1122.78 469.543 1092.41 445.45C1043.71 406.765 1002.12 336.123 994.511 274.3C983.482 184.717 1047.3 88.2417 1127.13 50.6411C1147.97 40.8247 1167.23 36.8739 1189.85 34.4272Z',
    cx: 1205,
    cy: 260,
    delayMs: 80,
    amp: 15,
    randomOffsetMs: 70,
    randomPauseMs: 260,
  },
  {
    // left-middle
    d: 'M474.652 436.694C488.446 434.198 509.088 437.378 523.033 439.043C645.205 453.623 706.918 565.33 725.44 676.451C733.262 723.368 716.065 773.189 687.199 810.772C649.338 859.995 593.296 891.951 531.653 899.473C528.839 899.764 526.023 900.04 523.205 900.294C377.307 913.465 265.709 748.784 281.867 615.371C286.567 576.559 304.395 541.244 329.365 511.666C367.168 466.888 416.481 441.681 474.652 436.694Z',
    cx: 500,
    cy: 670,
    delayMs: 55,
    amp: 14,
    randomOffsetMs: 200,
    randomPauseMs: 180,
  },
  {
    // right-middle
    d: 'M951.949 458.458C964.539 458.197 978.065 457.752 990.561 458.844C1097.08 468.3 1204.57 527.127 1216.9 643.33C1223.63 706.762 1199.1 778.823 1158.69 827.814C1130.39 861.556 1092.48 885.895 1050.02 897.586C1041.87 899.902 1031.93 902.509 1023.6 903.322C1017.24 904.411 1010.83 905.275 1004.41 905.914C945.015 911.49 895.591 892.314 850.059 854.781C795.705 809.988 767.969 749.401 760.766 680.037C755.146 625.93 760.178 574.873 797.062 531.615C836.096 485.824 893.115 463.737 951.949 458.458Z',
    cx: 990,
    cy: 680,
    delayMs: 25,
    amp: 17,
    randomOffsetMs: 40,
    randomPauseMs: 340,
  },
  {
    // bottom
    d: 'M726.459 878.169C726.612 878.155 726.764 878.133 726.917 878.119C785.22 874.764 850.494 889.359 896.709 926.165C941.472 961.81 967.574 1018.1 973.506 1073.93C979.649 1131.74 961.424 1188.67 924.685 1233.23C884.475 1281.99 835.131 1321.1 770.917 1328.2C770.336 1328.26 769.748 1328.31 769.167 1328.36C715.692 1332.23 639.335 1305.71 600.018 1270.27C508.552 1187.82 495.9 1037.81 579.591 944.913C622.663 897.099 665.185 882.541 726.459 878.169Z',
    cx: 760,
    cy: 1105,
    delayMs: 70,
    amp: 12,
    randomOffsetMs: 110,
    randomPauseMs: 280,
  },
];

const GRAPE_COUNT = GRAPES.length;
/** Gap between successive berry pulses in sequence mode (phase lead-in). */
const SEQUENCE_STEP_MS = 95;
/** How long each snap pose is held (stop-motion frame). */
const ROT_HOLD_MS = 70;
const PULSE_HOLD_MS = 85;

/** Instant pose change — no interpolation. */
function snapTo(value: number) {
  return withTiming(value, { duration: 0 });
}

/** Snap to value, then hold still for `holdMs`. */
function snapHold(value: number, holdMs: number) {
  const hold = Math.max(0, holdMs);
  if (hold <= 0) return snapTo(value);
  return withSequence(snapTo(value), withTiming(value, { duration: hold }));
}

function WobbleGrape({
  grape,
  index,
  color,
  animating,
  ampScale,
  speedScale,
  pauseMs,
  pulseMode,
  pulseDepth,
  squash,
}: {
  grape: Grape;
  index: number;
  color: string;
  animating: boolean;
  ampScale: number;
  speedScale: number;
  pauseMs: number;
  pulseMode: GrapePulseMode;
  pulseDepth: number;
  squash: number;
}) {
  const rot = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const speed = Math.max(0.25, speedScale);
  const depth = Math.min(0.85, Math.max(0, pulseDepth));
  const baseMin = 1 - depth;
  const baseMax = 1 + depth * 0.35;
  /** Axis bias — kept in range so berries don't invert. */
  const sq = Math.min(0.55, Math.max(0, squash)) * 0.85;
  // Alternate which axis flattens first so the cluster feels less symmetrical.
  const horizontalFirst = index % 2 === 0;

  useEffect(() => {
    if (!animating) {
      cancelAnimation(rot);
      cancelAnimation(scaleX);
      cancelAnimation(scaleY);
      rot.value = snapTo(0);
      scaleX.value = snapTo(1);
      scaleY.value = snapTo(1);
      return;
    }

    const a = grape.amp * ampScale;
    /** Hold durations only — speed shortens how long each frame sits, not a tween. */
    const hold = (ms: number) => Math.max(16, Math.round(ms / speed));
    const clampAxis = (v: number) => Math.max(0.18, v);

    const squashX = clampAxis(horizontalFirst ? baseMin * (1 + sq) : baseMin * (1 - sq));
    const squashY = clampAxis(horizontalFirst ? baseMin * (1 - sq) : baseMin * (1 + sq));
    const stretchX = clampAxis(horizontalFirst ? baseMax * (1 - sq) : baseMax * (1 + sq));
    const stretchY = clampAxis(horizontalFirst ? baseMax * (1 + sq) : baseMax * (1 - sq));

    const rotHold = hold(ROT_HOLD_MS);
    rot.value = withDelay(
      hold(grape.delayMs),
      withRepeat(
        withSequence(
          snapHold(a, rotHold),
          snapHold(-a * 0.85, rotHold),
          snapHold(a * 0.55, rotHold),
          snapHold(-a * 0.35, rotHold),
          snapHold(0, hold(pauseMs + grape.delayMs)),
        ),
        -1,
        false,
      ),
    );

    const pulseHold = hold(PULSE_HOLD_MS);
    const pulseX = withSequence(
      snapHold(squashX, pulseHold),
      snapHold(stretchX, pulseHold),
      snapHold(1, pulseHold),
    );
    const pulseY = withSequence(
      snapHold(squashY, pulseHold),
      snapHold(stretchY, pulseHold),
      snapHold(1, pulseHold),
    );
    const pulseLen = pulseHold * 3;

    if (pulseMode === 'sequence') {
      // Same cycle length for every berry; only the lead-in phase differs.
      const step = hold(SEQUENCE_STEP_MS);
      const cycleLen = (GRAPE_COUNT - 1) * step + pulseLen + hold(pauseMs);
      const leadIn = index * step;
      const trail = Math.max(0, cycleLen - leadIn - pulseLen);

      scaleX.value = withRepeat(
        withSequence(snapHold(1, leadIn), pulseX, snapHold(1, trail)),
        -1,
        false,
      );
      scaleY.value = withRepeat(
        withSequence(snapHold(1, leadIn), pulseY, snapHold(1, trail)),
        -1,
        false,
      );
    } else {
      const rest = hold(grape.randomPauseMs + pauseMs);
      scaleX.value = withDelay(
        hold(grape.randomOffsetMs),
        withRepeat(withSequence(pulseX, snapHold(1, rest)), -1, false),
      );
      scaleY.value = withDelay(
        hold(grape.randomOffsetMs),
        withRepeat(withSequence(pulseY, snapHold(1, rest)), -1, false),
      );
    }

    return () => {
      cancelAnimation(rot);
      cancelAnimation(scaleX);
      cancelAnimation(scaleY);
    };
  }, [
    animating,
    ampScale,
    speed,
    pauseMs,
    pulseMode,
    depth,
    baseMin,
    baseMax,
    sq,
    horizontalFirst,
    grape.amp,
    grape.delayMs,
    grape.randomOffsetMs,
    grape.randomPauseMs,
    index,
    rot,
    scaleX,
    scaleY,
  ]);

  const animatedProps = useAnimatedProps(() => {
    const { cx, cy } = grape;
    return {
      transform: `translate(${cx} ${cy}) rotate(${rot.value}) scale(${scaleX.value} ${scaleY.value}) translate(${-cx} ${-cy})`,
    };
  });

  return (
    <AnimatedG animatedProps={animatedProps}>
      <Path d={grape.d} fill={color} />
    </AnimatedG>
  );
}

/**
 * Grapejuice grape-cluster logomark (organic 6-grape mark).
 * Prefer this over the PNG assets for crisp scaling on web + native.
 */
export function GrapejuiceLogomarkSvg({
  width = 30,
  height,
  color = '#000000',
  animating = false,
  wobble,
}: Props) {
  const h = height ?? width / LOGOMARK_ASPECT;
  const ampScale = wobble?.ampScale ?? DEFAULT_GRAPE_WOBBLE.ampScale;
  const speedScale = wobble?.speedScale ?? DEFAULT_GRAPE_WOBBLE.speedScale;
  const pauseMs = wobble?.pauseMs ?? DEFAULT_GRAPE_WOBBLE.pauseMs;
  const pulseMode = wobble?.pulseMode ?? DEFAULT_GRAPE_WOBBLE.pulseMode;
  const pulseDepth = wobble?.pulseDepth ?? DEFAULT_GRAPE_WOBBLE.pulseDepth;
  const squash = wobble?.squash ?? DEFAULT_GRAPE_WOBBLE.squash;

  return (
    <Svg width={width} height={h} viewBox="0 0 1487 1360" fill="none">
      {GRAPES.map((grape, i) => (
        <WobbleGrape
          key={i}
          index={i}
          grape={grape}
          color={color}
          animating={animating}
          ampScale={ampScale}
          speedScale={speedScale}
          pauseMs={pauseMs}
          pulseMode={pulseMode}
          pulseDepth={pulseDepth}
          squash={squash}
        />
      ))}
    </Svg>
  );
}
