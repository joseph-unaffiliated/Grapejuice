import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';
import { BOX_DISPLAY_SECTIONS, type BoxDisplaySectionId } from '../constants/boxDisplaySections';
import { BOX_DETAIL_SCROLL_SPY_OFFSET } from '../components/box/boxDetailLayout';

type HostNode = {
  scrollTo?: (opts: { x?: number; y?: number; animated?: boolean }) => void;
  getScrollableNode?: () => HTMLElement | null;
};

/** Nearest DOM ancestor that actually scrolls (RN ScrollView often isn't it on web). */
function findScrollParent(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    const canScroll =
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 1;
    if (canScroll) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

/**
 * Scroll-spy + scroll-to for box section tabs (not a content filter).
 * Web uses DOM geometry against the real scrollport — layout.y + ScrollView.scrollTo
 * were no-ops when sticky/flex made a parent the actual scroller.
 */
export function useBoxDetailScroll(initialSection: BoxDisplaySectionId = 'candles') {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const sectionNodes = useRef<Partial<Record<BoxDisplaySectionId, HTMLElement | null>>>({});
  const sectionOffsets = useRef<Partial<Record<BoxDisplaySectionId, number>>>({});
  const scrollingToSection = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSection, setActiveSection] = useState<BoxDisplaySectionId>(initialSection);

  const registerSection = useCallback((id: BoxDisplaySectionId, node: unknown) => {
    sectionNodes.current[id] = (node as HTMLElement | null) ?? null;
  }, []);

  const onSectionLayout = useCallback(
    (id: BoxDisplaySectionId) => (e: LayoutChangeEvent) => {
      sectionOffsets.current[id] = e.nativeEvent.layout.y;
    },
    [],
  );

  const updateActiveFromScroll = (scrollY: number) => {
    if (scrollingToSection.current) return;
    const probe = scrollY + BOX_DETAIL_SCROLL_SPY_OFFSET;
    let next: BoxDisplaySectionId = BOX_DISPLAY_SECTIONS[0].id;
    for (const { id } of BOX_DISPLAY_SECTIONS) {
      const y = sectionOffsets.current[id];
      if (y !== undefined && y <= probe) next = id;
    }
    setActiveSection((prev) => (prev === next ? prev : next));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateActiveFromScroll(e.nativeEvent.contentOffset.y);
  };

  const scrollToSection = useCallback((id: BoxDisplaySectionId) => {
    setActiveSection(id);
    scrollingToSection.current = true;

    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      scrollingToSection.current = false;
    }, 500);

    if (Platform.OS === 'web') {
      const sectionEl = sectionNodes.current[id];
      if (sectionEl) {
        const scrollEl = findScrollParent(sectionEl);
        const top =
          sectionEl.getBoundingClientRect().top -
          scrollEl.getBoundingClientRect().top +
          scrollEl.scrollTop -
          BOX_DETAIL_SCROLL_SPY_OFFSET;
        const y = Math.max(0, top);
        scrollEl.scrollTo({ top: y, behavior: 'smooth' });
        return;
      }
    }

    const y = sectionOffsets.current[id];
    const host = scrollRef.current as unknown as HostNode | null;
    if (y !== undefined && host?.scrollTo) {
      host.scrollTo({ y: Math.max(0, y - BOX_DETAIL_SCROLL_SPY_OFFSET), animated: true });
    }
  }, []);

  return {
    scrollRef,
    contentRef,
    activeSection,
    registerSection,
    onSectionLayout,
    onScroll,
    scrollToSection,
  };
}
