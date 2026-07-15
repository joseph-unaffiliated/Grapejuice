import { useCallback, useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Measures a full-width container and returns the left inset for a centered max-width column.
 * Tracks flex layout width (including sidebar animation) instead of instant sidebarWidth math.
 */
export function useMeasuredContentColumnOffset(layoutWidth: number, enabled: boolean) {
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayoutContainer = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setContainerWidth(width);
    }
  }, []);

  const contentColumnOffset = useMemo(() => {
    if (!enabled || containerWidth <= 0) return 0;
    return Math.max(0, (containerWidth - layoutWidth) / 2);
  }, [enabled, containerWidth, layoutWidth]);

  return { contentColumnOffset, onLayoutContainer };
}
