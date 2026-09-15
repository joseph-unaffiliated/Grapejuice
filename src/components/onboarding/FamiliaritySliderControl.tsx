import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { semanticColors, spacing } from '../../constants/theme';

type Props = {
  value: number;
  onChange: (value: number) => void;
};

const THUMB = 28;
const TRACK_H = 8;
/** Ignore diagonal noise until the finger clearly commits horizontally. */
const AXIS_LOCK_DX = 8;

/**
 * 0–100 familiarity slider that yields to vertical ScrollViews until the
 * gesture is clearly horizontal — avoids the iPhone scroll-vs-drag fight.
 * Click/tap anywhere on the hit strip jumps the thumb; drag still scrubbs.
 */
export function FamiliaritySliderControl({ value, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const hitRef = useRef<View>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const draggingRef = useRef(false);
  const startPageRef = useRef<{ x: number; y: number } | null>(null);
  const axisLockedRef = useRef(false);

  const applyXInTrack = (xInTrack: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, xInTrack / w));
    onChangeRef.current(Math.round(ratio * 100));
  };

  const seekToPageX = (pageX: number) => {
    hitRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) {
        trackLeftRef.current = x;
        trackWidthRef.current = width;
        setTrackWidth((prev) => (prev === width ? prev : width));
      }
      applyXInTrack(pageX - trackLeftRef.current);
    });
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch on the hit strip so we can tap-to-seek and drag without
        // a competing TouchableOpacity overlay. Yield only when the gesture is vertical.
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          if (draggingRef.current || axisLockedRef.current) return true;
          if (Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > AXIS_LOCK_DX) return false;
          return Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > AXIS_LOCK_DX;
        },
        onMoveShouldSetPanResponderCapture: (_, g) => {
          if (draggingRef.current || axisLockedRef.current) return true;
          if (Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > AXIS_LOCK_DX) return false;
          return Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > AXIS_LOCK_DX;
        },
        onPanResponderGrant: (e) => {
          startPageRef.current = {
            x: e.nativeEvent.pageX,
            y: e.nativeEvent.pageY,
          };
          axisLockedRef.current = false;
          draggingRef.current = false;
          // Tap-to-seek immediately; drag continues on move once horizontal.
          seekToPageX(e.nativeEvent.pageX);
        },
        onPanResponderMove: (e, g) => {
          if (!axisLockedRef.current) {
            if (Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > AXIS_LOCK_DX) {
              // Vertical scroll — release so ScrollView can take over.
              return;
            }
            if (Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > AXIS_LOCK_DX) {
              axisLockedRef.current = true;
              draggingRef.current = true;
            }
          }
          if (axisLockedRef.current || Math.abs(g.dx) <= AXIS_LOCK_DX) {
            seekToPageX(e.nativeEvent.pageX);
          }
        },
        onPanResponderRelease: () => {
          draggingRef.current = false;
          axisLockedRef.current = false;
          startPageRef.current = null;
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          axisLockedRef.current = false;
          startPageRef.current = null;
        },
        onPanResponderTerminationRequest: () => !draggingRef.current,
      }),
    []
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
    hitRef.current?.measureInWindow((x) => {
      trackLeftRef.current = x;
    });
  };

  const thumbLeft = trackWidth > 0 ? (value / 100) * trackWidth - THUMB / 2 : 0;

  const bindPointerListeners = (el: {
    getBoundingClientRect: () => DOMRect;
    clientX?: number;
  }, clientX: number) => {
    const rect = el.getBoundingClientRect();
    trackLeftRef.current = rect.left;
    trackWidthRef.current = rect.width;
    setTrackWidth(rect.width);
    applyXInTrack(clientX - rect.left);

    const onMove = (ev: PointerEvent | TouchEvent | MouseEvent) => {
      const x =
        'clientX' in ev
          ? ev.clientX
          : 'touches' in ev && ev.touches[0]
            ? ev.touches[0].clientX
            : trackLeftRef.current;
      applyXInTrack(x - trackLeftRef.current);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('mousemove', onMove as EventListener);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove as EventListener);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
    window.addEventListener('pointermove', onMove as EventListener);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('mousemove', onMove as EventListener);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove as EventListener, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
  };

  const webProps =
    Platform.OS === 'web'
      ? ({
          onPointerDown: (e: {
            clientX: number;
            pointerId?: number;
            preventDefault: () => void;
            currentTarget: { getBoundingClientRect: () => DOMRect; setPointerCapture?: (id: number) => void };
          }) => {
            e.preventDefault();
            if (typeof e.pointerId === 'number' && e.currentTarget.setPointerCapture) {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }
            bindPointerListeners(e.currentTarget, e.clientX);
          },
          onMouseDown: (e: {
            clientX: number;
            preventDefault: () => void;
            currentTarget: { getBoundingClientRect: () => DOMRect };
          }) => {
            // Fallback for browsers without pointer events.
            e.preventDefault();
            bindPointerListeners(e.currentTarget, e.clientX);
          },
          onTouchStart: (e: {
            preventDefault: () => void;
            nativeEvent?: { touches?: { clientX: number }[] };
            touches?: { clientX: number }[];
            currentTarget: { getBoundingClientRect: () => DOMRect };
          }) => {
            e.preventDefault();
            const touch =
              e.nativeEvent?.touches?.[0] ?? e.touches?.[0];
            if (!touch) return;
            bindPointerListeners(e.currentTarget, touch.clientX);
          },
        } as object)
      : null;

  return (
    <View style={styles.sliderWrap}>
      <View
        ref={hitRef}
        style={[
          styles.hit,
          Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'pointer' } as object) : null,
        ]}
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: value }}
        accessibilityLabel="Practice level"
        {...(Platform.OS === 'web' ? webProps : pan.panHandlers)}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: `${value}%` }]} />
          <View
            style={[
              styles.thumb,
              { left: Math.max(0, Math.min(Math.max(trackWidth - THUMB, 0), thumbLeft)) },
            ]}
          />
        </View>
      </View>
      <View style={styles.stepRow}>
        {[0, 25, 50, 75, 100].map((step) => (
          <TouchableOpacity
            key={step}
            onPress={() => onChange(step)}
            style={styles.stepBtn}
            accessibilityRole="button"
            accessibilityLabel={`Set practice level to ${step}`}
          >
            <View
              style={[
                styles.stepDot,
                value >= step - 5 && value <= step + 5 && styles.stepDotOn,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderWrap: { marginVertical: spacing.sm },
  /** Tall hit area so the thin track is easy to grab on a phone. */
  hit: {
    justifyContent: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: semanticColors.border,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_H / 2,
    backgroundColor: '#000000',
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#000000',
    top: -(THUMB - TRACK_H) / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.brand,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingHorizontal: 2,
  },
  stepBtn: {
    minWidth: 44,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: semanticColors.border,
  },
  stepDotOn: {
    backgroundColor: '#000000',
  },
});
