import React, { useEffect } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

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
  /** How far grapes shrink (0 = none, 1 = disappear). Default 0.21 → scale ≈ 0.79. */
  pulseDepth?: number;
  /**
   * Non-uniform squash on top of the pulse (0 = round shrink/grow, 1 = hard oval flatten).
   * Alternating berries squash horizontal-first vs vertical-first.
   */
  squash?: number;
};

export const DEFAULT_GRAPE_WOBBLE: Required<GrapeWobbleTune> = {
  ampScale: 1.47,
  speedScale: 0.49,
  pauseMs: 0,
  pulseMode: 'sequence',
  pulseDepth: 0.21,
  squash: 0.07,
};

type Props = {
  width?: number;
  height?: number;
  color?: string;
  /** Wobbly per-grape rotation while Rav (or similar) is thinking. */
  animating?: boolean;
  /** Loop the wobble while animating (default). Set false to play a single pass. */
  loop?: boolean;
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
/** How long a single berry pop lasts (squash → stretch → settle). */
const PULSE_MS = 255;
/** Calm beat before the cascade restarts so the loop never parks on a squash frame. */
const LOOP_REST_MS = 140;
/** Each held pose in the stop-motion tilt loop — long enough to read as a frame. */
const ROT_FRAME_MS = 70;
/** Full tilt loop: 4 tilt poses + 1 rest pose, held stop-motion style. */
const ROT_CYCLE_MS = ROT_FRAME_MS * 5;

/** Timing + pose config shared by every berry — derived once per cluster. */
type WobbleConfig = {
  /** Fraction of the cycle a single pop occupies. */
  pulseFrac: number;
  /** Fraction of the cycle between successive berry pops (sequence lead-in). */
  stepFrac: number;
  /** Quiet lead-in at the start of each cycle (all berries at rest). */
  restFrac: number;
  /** Full cycle length (ms) — used to normalize per-berry random offsets. */
  cycleMs: number;
  /** Tilt loop length (ms) — used to normalize per-berry rotation offsets. */
  rotCycleMs: number;
  baseMin: number;
  baseMax: number;
  sq: number;
  ampScale: number;
  pulseMode: GrapePulseMode;
};

/**
 * A single berry, driven entirely by two shared clocks (each 0→1 looping):
 * `clock` sequences the pops, `rotClock` runs the tilt loop. Its pose is a pure
 * function of those clocks, so all six berries stay in lockstep no matter how
 * the RAF timeline is paused/resumed (tab blur, etc.). Nothing is tweened —
 * every value snaps between held frames for a stop-motion, illustrated feel.
 */
function WobbleGrape({
  grape,
  index,
  color,
  clock,
  rotClock,
  active,
  config,
}: {
  grape: Grape;
  index: number;
  color: string;
  clock: SharedValue<number>;
  rotClock: SharedValue<number>;
  /** 1 while wobbling, 0 at rest — forces default size when off. */
  active: SharedValue<number>;
  config: WobbleConfig;
}) {
  const { pulseFrac, stepFrac, restFrac, cycleMs, rotCycleMs, baseMin, baseMax, sq, ampScale, pulseMode } =
    config;
  const a = grape.amp * ampScale;
  // Alternate which axis flattens first so the cluster feels less symmetrical.
  const horizontalFirst = index % 2 === 0;
  const clampAxis = (v: number) => Math.max(0.18, v);
  const squashX = clampAxis(horizontalFirst ? baseMin * (1 + sq) : baseMin * (1 - sq));
  const squashY = clampAxis(horizontalFirst ? baseMin * (1 - sq) : baseMin * (1 + sq));
  const stretchX = clampAxis(horizontalFirst ? baseMax * (1 - sq) : baseMax * (1 + sq));
  const stretchY = clampAxis(horizontalFirst ? baseMax * (1 + sq) : baseMax * (1 - sq));

  // Cascade starts after the shared rest beat so clock≈0 (loop wrap) is never a squash.
  const popStart =
    pulseMode === 'sequence'
      ? restFrac + index * stepFrac
      : (((restFrac + index * stepFrac + grape.randomOffsetMs / cycleMs) % 1) + 1) % 1;
  // Small per-berry lead on the tilt loop so they don't all tilt in unison.
  const rotOffset = (((grape.delayMs / rotCycleMs) % 1) + 1) % 1;

  const { cx, cy, d } = grape;
  const pf = pulseFrac;

  const animatedProps = useAnimatedProps(() => {
    // Rest pose — clock=0 otherwise parks grape 0 inside the squash window.
    if (active.value < 0.5) {
      return {
        transform: `translate(${cx} ${cy}) rotate(0) scale(1 1) translate(${-cx} ${-cy})`,
      };
    }

    // Pop window: snap to squash, then stretch, then settle — no tween between.
    const phase = (((clock.value - popStart) % 1) + 1) % 1;
    let sx = 1;
    let sy = 1;
    if (phase < pf / 3) {
      sx = squashX;
      sy = squashY;
    } else if (phase < (pf * 2) / 3) {
      sx = stretchX;
      sy = stretchY;
    }

    // Tilt loop: four held tilt poses then a rest, each a discrete frame.
    const rp = (((rotClock.value - rotOffset) % 1) + 1) % 1;
    let rot = 0;
    if (rp < 0.2) {
      rot = a;
    } else if (rp < 0.4) {
      rot = -a * 0.85;
    } else if (rp < 0.6) {
      rot = a * 0.55;
    } else if (rp < 0.8) {
      rot = -a * 0.35;
    }

    return {
      transform: `translate(${cx} ${cy}) rotate(${rot}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`,
    };
  });

  return (
    <AnimatedG animatedProps={animatedProps}>
      <Path d={d} fill={color} />
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
  loop = true,
  wobble,
}: Props) {
  const h = height ?? width / LOGOMARK_ASPECT;
  const ampScale = wobble?.ampScale ?? DEFAULT_GRAPE_WOBBLE.ampScale;
  const speedScale = wobble?.speedScale ?? DEFAULT_GRAPE_WOBBLE.speedScale;
  const pauseMs = wobble?.pauseMs ?? DEFAULT_GRAPE_WOBBLE.pauseMs;
  const pulseMode = wobble?.pulseMode ?? DEFAULT_GRAPE_WOBBLE.pulseMode;
  const pulseDepth = wobble?.pulseDepth ?? DEFAULT_GRAPE_WOBBLE.pulseDepth;
  const squash = wobble?.squash ?? DEFAULT_GRAPE_WOBBLE.squash;

  const speed = Math.max(0.25, speedScale);
  const scaleMs = (ms: number) => Math.max(16, Math.round(ms / speed));
  const stepMs = scaleMs(SEQUENCE_STEP_MS);
  const pulseMs = scaleMs(PULSE_MS);
  const pauseMsScaled = scaleMs(pauseMs);
  // Quiet beat at the start of every cycle (covers pauseMs + a minimum loop rest).
  const restMs = Math.max(pauseMsScaled, scaleMs(LOOP_REST_MS));
  // One cycle: rest → cascade → last berry pops → wrap back into rest.
  const cycleMs = restMs + (GRAPE_COUNT - 1) * stepMs + pulseMs;
  // Tilt runs on its own faster loop so berries keep a little life between pops.
  const rotCycleMs = scaleMs(ROT_CYCLE_MS);

  const depth = Math.min(0.85, Math.max(0, pulseDepth));
  const config: WobbleConfig = {
    pulseFrac: pulseMs / cycleMs,
    stepFrac: stepMs / cycleMs,
    restFrac: restMs / cycleMs,
    cycleMs,
    rotCycleMs,
    baseMin: 1 - depth,
    baseMax: 1 + depth * 0.35,
    /** Axis bias — kept in range so berries don't invert. */
    sq: Math.min(0.55, Math.max(0, squash)) * 0.85,
    ampScale,
    pulseMode,
  };

  // Two parent-owned clocks are the sole sources of timing truth: `clock`
  // sequences the pops (its order can never desync — all berries read it),
  // `rotClock` drives the continuous tilt loop.
  const clock = useSharedValue(0);
  const rotClock = useSharedValue(0);
  const active = useSharedValue(animating ? 1 : 0);

  useEffect(() => {
    cancelAnimation(clock);
    cancelAnimation(rotClock);
    if (!animating) {
      active.value = 0;
      clock.value = 0;
      rotClock.value = 0;
      return;
    }
    // Restart from 0 so the cascade always begins top-left, in order.
    active.value = 1;
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: cycleMs, easing: Easing.linear }),
      loop ? -1 : 1,
      false,
    );
    rotClock.value = 0;
    rotClock.value = withRepeat(
      withTiming(1, { duration: rotCycleMs, easing: Easing.linear }),
      loop ? -1 : 1,
      false,
    );
    return () => {
      cancelAnimation(clock);
      cancelAnimation(rotClock);
      active.value = 0;
    };
  }, [animating, loop, cycleMs, rotCycleMs, clock, rotClock, active]);

  return (
    <Svg width={width} height={h} viewBox="0 0 1487 1360" fill="none">
      {GRAPES.map((grape, i) => (
        <WobbleGrape
          key={i}
          index={i}
          grape={grape}
          color={color}
          clock={clock}
          rotClock={rotClock}
          active={active}
          config={config}
        />
      ))}
    </Svg>
  );
}
