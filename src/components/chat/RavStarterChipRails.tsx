import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import type { RavStarterChip } from '../../constants/ravStarterPrompts';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useThemeMode } from '../../context/ThemeContext';
import type { SemanticColors } from '../../constants/themeMode';

const ROW_COUNT = 3;
const LOOP_COPIES = 3;
const CHIP_GAP = 6;
const ROW_GAP = CHIP_GAP;
const EDGE_FADE_W = 72;
const CHIP_STROKE_IDLE = 'rgba(216, 201, 144, 0.35)';
const DRAG_THRESHOLD_PX = 4;

type Props = {
  chips: RavStarterChip[];
  onSelect: (message: string) => void;
  edgeBleed?: number;
};

function splitIntoRows(chips: RavStarterChip[], rows: number): RavStarterChip[][] {
  if (chips.length === 0) return [];
  const out: RavStarterChip[][] = Array.from({ length: rows }, () => []);
  chips.forEach((chip, i) => {
    out[i % rows].push(chip);
  });
  return out.filter((row) => row.length > 0);
}

/** Pixel offset into the middle copy — loops forever in either direction. */
function middleCopyX(offset: number, cycleW: number): number {
  if (cycleW <= 0) return 0;
  const mod = ((offset % cycleW) + cycleW) % cycleW;
  return -(cycleW + mod);
}

/**
 * Three prompt rows driven by one shared pixel offset (transform, not ScrollViews).
 * Drag moves every row in the same frame — no leader lag, no coast.
 */
export function RavStarterChipRails({ chips, onSelect, edgeBleed = 0 }: Props) {
  const { colors } = useThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rows = useMemo(() => splitIntoRows(chips, ROW_COUNT), [chips]);

  const rootRef = useRef<View | null>(null);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [cycleWidths, setCycleWidths] = useState<number[]>([]);

  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: null as number | null,
    startX: 0,
    startOffset: 0,
  });

  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    setCycleWidths([]);
  }, [chips]);

  const onCycleLayout = useCallback((rowIndex: number, width: number) => {
    if (width <= 0) return;
    const next = width + CHIP_GAP;
    setCycleWidths((prev) => {
      if (Math.abs((prev[rowIndex] ?? 0) - next) < 1) return prev;
      const copy = prev.slice();
      copy[rowIndex] = next;
      return copy;
    });
  }, []);

  const commitOffset = useCallback((next: number) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  // Web pointer drag on the mosaic root — one gesture, all rows follow together.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = {
        active: true,
        moved: false,
        pointerId: e.pointerId,
        startX: e.clientX,
        startOffset: offsetRef.current,
      };
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
      if (!d.moved) return;
      e.preventDefault();
      commitOffset(d.startOffset - dx);
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || d.pointerId !== e.pointerId) return;
      const wasDrag = d.moved;
      d.active = false;
      d.pointerId = null;
      if (!wasDrag) return;
      // Swallow the click that would otherwise fire on the chip under the pointer.
      const suppress = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        root.removeEventListener('click', suppress, true);
      };
      root.addEventListener('click', suppress, true);
      window.setTimeout(() => root.removeEventListener('click', suppress, true), 80);
    };

    root.addEventListener('pointerdown', onDown, true);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    return () => {
      root.removeEventListener('pointerdown', onDown, true);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
    };
  }, [commitOffset, chips]);

  // Native touch drag (non-web).
  const onTouchStart = useCallback((pageX: number) => {
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: null,
      startX: pageX,
      startOffset: offsetRef.current,
    };
  }, []);

  const onTouchMove = useCallback(
    (pageX: number) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = pageX - d.startX;
      if (!d.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
      if (!d.moved) return;
      commitOffset(d.startOffset - dx);
    },
    [commitOffset]
  );

  const onTouchEnd = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  if (!chips.length) return null;

  const bleedStyle =
    edgeBleed > 0
      ? ({
          alignSelf: 'stretch' as const,
          marginHorizontal: -edgeBleed,
          ...(Platform.OS === 'web'
            ? ({ width: `calc(100% + ${edgeBleed * 2}px)` } as object)
            : { width: '100%' as const }),
        } as const)
      : null;

  return (
    <View
      ref={rootRef}
      style={[styles.root, bleedStyle]}
      onStartShouldSetResponder={() => Platform.OS !== 'web'}
      onMoveShouldSetResponder={() => Platform.OS !== 'web'}
      onResponderGrant={(e) => onTouchStart(e.nativeEvent.pageX)}
      onResponderMove={(e) => onTouchMove(e.nativeEvent.pageX)}
      onResponderRelease={onTouchEnd}
      onResponderTerminate={onTouchEnd}
    >
      <View style={[styles.rows, { gap: ROW_GAP }]}>
        {rows.map((row, rowIndex) => {
          const cycleW = cycleWidths[rowIndex] ?? 0;
          const tx = cycleW > 0 ? middleCopyX(offset, cycleW) : 0;
          return (
            <View key={`row-${rowIndex}`} style={styles.rowClip}>
              <View style={[styles.rowTrack, { transform: [{ translateX: tx }] }]}>
                {Array.from({ length: LOOP_COPIES }, (_, copy) => (
                  <View
                    key={`copy-${copy}`}
                    style={styles.cycle}
                    onLayout={
                      copy === 0
                        ? (e: LayoutChangeEvent) =>
                            onCycleLayout(rowIndex, e.nativeEvent.layout.width)
                        : undefined
                    }
                  >
                    {row.map((chip) => (
                      <PromptChip
                        key={`${copy}-${chip.message}`}
                        chip={chip}
                        styles={styles}
                        hoverStroke={colors.goldMuted}
                        onSelect={onSelect}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <View pointerEvents="none" style={[styles.edgeFade, styles.edgeFadeLeft]}>
        <View
          style={[
            styles.edgeFadeFill,
            Platform.OS === 'web'
              ? ({
                  backgroundImage: `linear-gradient(to right, ${colors.bgPrimary} 0%, ${colors.bgPrimary} 28%, transparent 100%)`,
                } as object)
              : { backgroundColor: colors.bgPrimary, opacity: 0.85 },
          ]}
        />
      </View>
      <View pointerEvents="none" style={[styles.edgeFade, styles.edgeFadeRight]}>
        <View
          style={[
            styles.edgeFadeFill,
            Platform.OS === 'web'
              ? ({
                  backgroundImage: `linear-gradient(to left, ${colors.bgPrimary} 0%, ${colors.bgPrimary} 28%, transparent 100%)`,
                } as object)
              : { backgroundColor: colors.bgPrimary, opacity: 0.85 },
          ]}
        />
      </View>
    </View>
  );
}

function PromptChip({
  chip,
  styles,
  hoverStroke,
  onSelect,
}: {
  chip: RavStarterChip;
  styles: ReturnType<typeof createStyles>;
  hoverStroke: string;
  onSelect: (message: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      style={[
        styles.chip,
        { borderColor: hovered ? hoverStroke : CHIP_STROKE_IDLE },
        Platform.OS === 'web'
          ? ({ transitionProperty: 'border-color', transitionDuration: '120ms' } as object)
          : null,
      ]}
      onPress={() => onSelect(chip.message)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={chip.message}
    >
      {chip.lines.slice(0, 2).map((line, i) => (
        <Text key={`${chip.message}-${i}`} style={styles.chipText}>
          {line}
        </Text>
      ))}
    </Pressable>
  );
}

function createStyles(colors: SemanticColors) {
  return StyleSheet.create({
    root: {
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? ({ touchAction: 'pan-y', userSelect: 'none', cursor: 'grab' } as object)
        : null),
    },
    rows: {
      width: '100%',
    },
    rowClip: {
      width: '100%',
      overflow: 'hidden',
    },
    rowTrack: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      gap: CHIP_GAP,
    },
    cycle: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      gap: CHIP_GAP,
    },
    chip: {
      flexShrink: 0,
      borderWidth: 0.5,
      borderColor: CHIP_STROKE_IDLE,
      borderRadius: borderRadius.chip,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: {
      fontSize: typography.sm,
      fontWeight: '200',
      color: colors.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.22,
      lineHeight: 14,
    },
    edgeFade: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: EDGE_FADE_W,
      zIndex: 2,
    },
    edgeFadeLeft: { left: 0 },
    edgeFadeRight: { right: 0 },
    edgeFadeFill: {
      ...StyleSheet.absoluteFillObject,
    },
  });
}
