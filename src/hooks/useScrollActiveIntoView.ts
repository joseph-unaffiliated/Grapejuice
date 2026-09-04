import { useCallback, useEffect, useRef } from 'react';
import {
  type LayoutChangeEvent,
  type ScrollView,
} from 'react-native';

/**
 * Horizontally scroll a tab strip so the active item stays centered when possible.
 * Same behavior as box StickySectionNav — click or route change brings the tab into view.
 */
export function useScrollActiveIntoView<T extends string>(activeId: T | undefined) {
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Partial<Record<T, { x: number; width: number }>>>({});
  const viewportW = useRef(0);
  const contentW = useRef(0);

  const ensureVisible = useCallback((id: T | undefined, animated = true) => {
    if (!id) return;
    const layout = layouts.current[id];
    const viewW = viewportW.current;
    if (!layout || viewW <= 0) return;
    const maxX = Math.max(0, contentW.current - viewW);
    const centered = layout.x + layout.width / 2 - viewW / 2;
    const next = Math.max(0, Math.min(maxX, centered));
    scrollRef.current?.scrollTo({ x: next, animated });
  }, []);

  useEffect(() => {
    ensureVisible(activeId);
  }, [activeId, ensureVisible]);

  const onItemLayout = useCallback(
    (id: T) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layouts.current[id] = { x, width };
      if (id === activeId) ensureVisible(id, false);
    },
    [activeId, ensureVisible]
  );

  const onScrollLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportW.current = e.nativeEvent.layout.width;
      ensureVisible(activeId, false);
    },
    [activeId, ensureVisible]
  );

  const onContentSizeChange = useCallback(
    (w: number) => {
      contentW.current = w;
      ensureVisible(activeId, false);
    },
    [activeId, ensureVisible]
  );

  return { scrollRef, onItemLayout, onScrollLayout, onContentSizeChange, ensureVisible };
}
