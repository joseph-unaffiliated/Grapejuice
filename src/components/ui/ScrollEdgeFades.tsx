import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Platform,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';

const EDGE_EPS = 6;
const DEFAULT_FADE_W = 36;
const FADE_MS = 220;

export type HorizontalScrollEdges = {
  showLeft: boolean;
  showRight: boolean;
};

/**
 * Track whether a horizontal scroller can move further left/right —
 * used to show edge fades that hint at more content.
 */
export function useHorizontalScrollEdges(): HorizontalScrollEdges & {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  onContentSizeChange: (w: number, h: number) => void;
} {
  const [viewportW, setViewportW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [offsetX, setOffsetX] = useState(0);

  const sync = useCallback((x: number, viewW: number, contW: number) => {
    setOffsetX(x);
    setViewportW(viewW);
    setContentW(contW);
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    sync(contentOffset.x, layoutMeasurement.width, contentSize.width);
  }, [sync]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportW(e.nativeEvent.layout.width);
  }, []);

  const onContentSizeChange = useCallback((w: number) => {
    setContentW(w);
  }, []);

  const overflow = contentW > viewportW + EDGE_EPS;
  const showLeft = overflow && offsetX > EDGE_EPS;
  const showRight = overflow && offsetX + viewportW < contentW - EDGE_EPS;

  return { showLeft, showRight, onScroll, onLayout, onContentSizeChange };
}

type FadeProps = {
  showLeft: boolean;
  showRight: boolean;
  /** Match the surface behind the rail (usually page bg). */
  color?: string;
  width?: number;
};

function useFadeOpacity(visible: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [opacity, visible]);
  return opacity;
}

/** Absolute L/R gradient fades — pointerEvents none so scrolls still work. */
export function HorizontalScrollEdgeFades({
  showLeft,
  showRight,
  color = '#FFFFFF',
  width = DEFAULT_FADE_W,
}: FadeProps) {
  const leftOpacity = useFadeOpacity(showLeft);
  const rightOpacity = useFadeOpacity(showRight);

  const webFade = (side: 'left' | 'right') =>
    Platform.OS === 'web'
      ? ({
          backgroundImage:
            side === 'left'
              ? `linear-gradient(to right, ${color} 0%, ${color} 28%, transparent 100%)`
              : `linear-gradient(to left, ${color} 0%, ${color} 28%, transparent 100%)`,
        } as object)
      : { backgroundColor: color };

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fade,
          styles.left,
          { width, opacity: leftOpacity },
          webFade('left'),
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fade,
          styles.right,
          { width, opacity: rightOpacity },
          webFade('right'),
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
  left: { left: 0 },
  right: { right: 0 },
});
