import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  /** Start loading a bit before the section scrolls into view. */
  rootMargin?: string;
  /** Reserve space so the page doesn’t jump when the section mounts. */
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Web: mount children once they approach the viewport so below-fold
 * images/videos don’t compete with the hero on first paint.
 * Prefetch well ahead of the fold (default ~¾ viewport) so media is ready
 * by the time the user scrolls to it — not only as it crosses the edge.
 * Native: mount immediately (no IntersectionObserver here).
 */
export function LazyMount({
  children,
  rootMargin = '600px 0px',
  minHeight = 1,
  style,
}: Props) {
  const hostRef = useRef<View>(null);
  const [active, setActive] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web' || active) return;
    const node = hostRef.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [active, rootMargin]);

  return (
    <View
      ref={hostRef}
      style={[!active && minHeight > 0 ? { minHeight } : null, style]}
      collapsable={false}
    >
      {active ? children : null}
    </View>
  );
}
