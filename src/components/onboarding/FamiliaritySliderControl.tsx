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
 */
export function FamiliaritySliderControl({ value, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const draggingRef = useRef(false);

  const setFromX = (x: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    onChangeRef.current(Math.round(ratio * 100));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > AXIS_LOCK_DX,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > AXIS_LOCK_DX,
        onPanResponderGrant: (e) => {
          draggingRef.current = true;
          setFromX(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => {
          setFromX(e.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          draggingRef.current = false;
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
        },
        // Keep the thumb while dragging so the parent ScrollView can't yank it.
        onPanResponderTerminationRequest: () => !draggingRef.current,
      }),
    []
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  };

  const thumbLeft = trackWidth > 0 ? (value / 100) * trackWidth - THUMB / 2 : 0;

  return (
    <View style={styles.sliderWrap}>
      <View
        style={[
          styles.hit,
          Platform.OS === 'web' ? ({ touchAction: 'pan-x' } as object) : null,
        ]}
        onLayout={onLayout}
        {...pan.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.track}
          onPress={(e) => setFromX(e.nativeEvent.locationX)}
          accessibilityRole="adjustable"
          accessibilityValue={{ min: 0, max: 100, now: value }}
        >
          <View style={[styles.fill, { width: `${value}%` }]} />
          <View
            style={[
              styles.thumb,
              { left: Math.max(0, Math.min(trackWidth - THUMB, thumbLeft)) },
            ]}
            pointerEvents="none"
          />
        </TouchableOpacity>
      </View>
      <View style={styles.stepRow}>
        {[0, 25, 50, 75, 100].map((step) => (
          <TouchableOpacity
            key={step}
            onPress={() => onChange(step)}
            style={styles.stepBtn}
            accessibilityRole="button"
            accessibilityLabel={`Set familiarity to ${step}`}
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
