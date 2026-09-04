import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Platform,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';

const DEFAULT_FADE_W = 28;
/** Opaque plate at the outer edge so product can’t peek through antialias gaps. */
const SOLID_CAP = 3;
const EDGE_EPS = 2;

export type HorizontalScrollEdges = {
  /** 1 when content is scrolled past the start, else 0. */
  leftProgress: number;
  /** 1 when more content remains to the right, else 0. */
  rightProgress: number;
};

/**
 * Track whether a horizontal scroller can move further left/right.
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
  const maxScroll = Math.max(0, contentW - viewportW);
  const leftProgress = overflow && offsetX > EDGE_EPS ? 1 : 0;
  const rightProgress = overflow && offsetX < maxScroll - EDGE_EPS ? 1 : 0;

  return { leftProgress, rightProgress, onScroll, onLayout, onContentSizeChange };
}

type FadeProps = {
  leftProgress: number;
  rightProgress: number;
  color?: string;
  width?: number;
};

function EdgeFade({
  side,
  visible,
  color,
  width,
}: {
  side: 'left' | 'right';
  visible: boolean;
  color: string;
  width: number;
}) {
  const gradientStyle =
    Platform.OS === 'web'
      ? ({
          backgroundImage:
            side === 'left'
              ? `linear-gradient(to right, ${color} 0%, ${color} 16%, transparent 100%)`
              : `linear-gradient(to left, ${color} 0%, ${color} 16%, transparent 100%)`,
        } as object)
      : { backgroundColor: color };

  return (
    <View
      pointerEvents="none"
      style={[
        styles.fade,
        side === 'left' ? styles.left : styles.right,
        {
          width,
          opacity: visible ? 1 : 0,
          ...(Platform.OS === 'web'
            ? ({
                transitionProperty: 'opacity',
                transitionDuration: '120ms',
                transitionTimingFunction: 'ease-out',
              } as object)
            : null),
        },
      ]}
    >
      <View style={[styles.gradientFill, gradientStyle]} />
      <View
        style={[
          styles.solidCap,
          side === 'left' ? styles.solidCapLeft : styles.solidCapRight,
          { backgroundColor: color, width: SOLID_CAP },
        ]}
      />
    </View>
  );
}

/** Fixed L/R soft masks — opacity only, no slide/grow. */
export function HorizontalScrollEdgeFades({
  leftProgress,
  rightProgress,
  color = '#FFFFFF',
  width = DEFAULT_FADE_W,
}: FadeProps) {
  return (
    <>
      <EdgeFade side="left" visible={leftProgress > 0.5} color={color} width={width} />
      <EdgeFade side="right" visible={rightProgress > 0.5} color={color} width={width} />
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
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
  },
  solidCap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  solidCapLeft: { left: 0 },
  solidCapRight: { right: 0 },
});
