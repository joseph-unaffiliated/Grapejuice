import { useCallback, useEffect, useRef, useState } from 'react';
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

export type UseBoxDetailScrollOptions = {
  initialSection?: BoxDisplaySectionId;
  /** Tabs and scroll-spy only consider these sections (typically non-empty). */
  visibleSectionIds?: BoxDisplaySectionId[];
  /** When false, web scroll-spy waits (e.g. reveal screen still loading catalog). */
  contentReady?: boolean;
};

function sectionDomId(id: BoxDisplaySectionId): string {
  return `box-section-${id}`;
}

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

function isDomElement(node: unknown): node is HTMLElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    'getBoundingClientRect' in node &&
    typeof (node as HTMLElement).getBoundingClientRect === 'function'
  );
}

function isRootScrollElement(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body;
}

function readScrollTop(scrollEl: HTMLElement): number {
  return isRootScrollElement(scrollEl) ? window.scrollY : scrollEl.scrollTop;
}

function scrollWebContainer(scrollEl: HTMLElement, top: number) {
  const y = Math.max(0, top);
  if (isRootScrollElement(scrollEl)) {
    window.scrollTo({ top: y, behavior: 'smooth' });
    return;
  }
  scrollEl.scrollTo({ top: y, behavior: 'smooth' });
}

function asView(node: unknown): View | null {
  return node && typeof node === 'object' && 'measureLayout' in node ? (node as View) : null;
}

/**
 * Scroll-spy + scroll-to for box section tabs (not a content filter).
 * Offsets are measured against `contentRef` (top of ScrollView content) so nested
 * desktop columns don't break scrollTo.
 */
export function useBoxDetailScroll(options: UseBoxDetailScrollOptions = {}) {
  const visibleSectionIds =
    options.visibleSectionIds ?? BOX_DISPLAY_SECTIONS.map((section) => section.id);
  const contentReady = options.contentReady ?? true;
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const sectionNodes = useRef<Partial<Record<BoxDisplaySectionId, unknown>>>({});
  const sectionOffsets = useRef<Partial<Record<BoxDisplaySectionId, number>>>({});
  const scrollingToSection = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSection, setActiveSection] = useState<BoxDisplaySectionId>(
    options.initialSection ?? visibleSectionIds[0] ?? 'candles',
  );

  const resolveScrollContainer = useCallback((sectionEl: HTMLElement): HTMLElement => {
    const fromParent = findScrollParent(sectionEl);
    if (fromParent.scrollHeight > fromParent.clientHeight + 1) return fromParent;

    const host = scrollRef.current as unknown as HostNode | null;
    const fromRef = host?.getScrollableNode?.();
    if (fromRef && fromRef.scrollHeight > fromRef.clientHeight + 1) return fromRef;

    return fromParent;
  }, []);

  const resolveSectionElement = useCallback((id: BoxDisplaySectionId): HTMLElement | null => {
    if (Platform.OS === 'web') {
      const byId = document.getElementById(sectionDomId(id));
      if (byId) return byId;
    }
    const node = sectionNodes.current[id];
    return isDomElement(node) ? node : null;
  }, []);

  const registerSection = useCallback((id: BoxDisplaySectionId, node: unknown) => {
    sectionNodes.current[id] = node ?? null;
  }, []);

  const measureSectionOffset = useCallback((id: BoxDisplaySectionId) => {
    const sectionNode = asView(sectionNodes.current[id]);
    const contentNode = contentRef.current;
    if (!sectionNode || !contentNode) return;

    sectionNode.measureLayout(
      contentNode,
      (_x, y) => {
        sectionOffsets.current[id] = y;
      },
      () => {},
    );
  }, []);

  const onSectionLayout = useCallback(
    (id: BoxDisplaySectionId) => (e: LayoutChangeEvent) => {
      sectionOffsets.current[id] = e.nativeEvent.layout.y;
      measureSectionOffset(id);
    },
    [measureSectionOffset],
  );

  useEffect(() => {
    if (!visibleSectionIds.includes(activeSection)) {
      setActiveSection(visibleSectionIds[0] ?? 'candles');
    }
  }, [activeSection, visibleSectionIds]);

  useEffect(() => {
    for (const id of visibleSectionIds) {
      measureSectionOffset(id);
    }
  }, [measureSectionOffset, visibleSectionIds]);

  /** Re-run after async content (e.g. catalog) mounts section blocks. */
  const remeasureSections = useCallback(() => {
    for (const id of visibleSectionIds) {
      measureSectionOffset(id);
    }
  }, [measureSectionOffset, visibleSectionIds]);

  const updateActiveFromScroll = useCallback(
    (scrollY: number) => {
      if (scrollingToSection.current) return;
      const probe = scrollY + BOX_DETAIL_SCROLL_SPY_OFFSET;
      let next: BoxDisplaySectionId = visibleSectionIds[0] ?? 'candles';
      for (const id of visibleSectionIds) {
        const y = sectionOffsets.current[id];
        if (y !== undefined && y <= probe) next = id;
      }
      setActiveSection((prev) => (prev === next ? prev : next));
    },
    [visibleSectionIds],
  );

  const updateActiveFromDom = useCallback(
    (scrollEl: HTMLElement) => {
      if (scrollingToSection.current) return;
      const scrollTop = readScrollTop(scrollEl);
      const probe = scrollTop + BOX_DETAIL_SCROLL_SPY_OFFSET;
      let next: BoxDisplaySectionId = visibleSectionIds[0] ?? 'candles';

      for (const id of visibleSectionIds) {
        const el = resolveSectionElement(id);
        if (!el) continue;
        const top =
          el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollTop;
        if (top <= probe) next = id;
      }

      setActiveSection((prev) => (prev === next ? prev : next));
    },
    [resolveSectionElement, visibleSectionIds],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateActiveFromScroll(e.nativeEvent.contentOffset.y);
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !contentReady) return undefined;

    let cancelled = false;
    let scrollEl: HTMLElement | null = null;
    let raf = 0;
    let removeListener: (() => void) | undefined;

    const attach = () => {
      if (cancelled) return;

      scrollEl = null;
      for (const id of visibleSectionIds) {
        const sectionEl = document.getElementById(sectionDomId(id));
        if (sectionEl) {
          scrollEl = resolveScrollContainer(sectionEl);
          break;
        }
      }

      if (!scrollEl) {
        const host = scrollRef.current as unknown as HostNode | null;
        scrollEl = host?.getScrollableNode?.() ?? null;
      }

      if (!scrollEl) {
        raf = requestAnimationFrame(attach);
        return;
      }

      const onScrollEvent = () => updateActiveFromDom(scrollEl!);
      const scrollTarget = isRootScrollElement(scrollEl) ? window : scrollEl;
      scrollTarget.addEventListener('scroll', onScrollEvent, { passive: true });
      removeListener = () => scrollTarget.removeEventListener('scroll', onScrollEvent);
    };

    attach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      removeListener?.();
    };
  }, [contentReady, resolveScrollContainer, updateActiveFromDom, visibleSectionIds]);

  const scrollToSection = useCallback(
    (id: BoxDisplaySectionId) => {
      if (!visibleSectionIds.includes(id)) return;

      setActiveSection(id);
      scrollingToSection.current = true;

      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
      scrollEndTimer.current = setTimeout(() => {
        scrollingToSection.current = false;
      }, 500);

      if (Platform.OS === 'web') {
        const sectionEl = resolveSectionElement(id);
        if (sectionEl) {
          const scrollEl = resolveScrollContainer(sectionEl);
          const sectionTop =
            sectionEl.getBoundingClientRect().top -
            scrollEl.getBoundingClientRect().top +
            readScrollTop(scrollEl);
          scrollWebContainer(scrollEl, sectionTop - BOX_DETAIL_SCROLL_SPY_OFFSET);
          return;
        }
      }

      const scrollToY = (y: number) => {
        const host = scrollRef.current as unknown as HostNode | null;
        if (host?.scrollTo) {
          host.scrollTo({ y: Math.max(0, y - BOX_DETAIL_SCROLL_SPY_OFFSET), animated: true });
          return true;
        }
        return false;
      };

      const sectionNode = asView(sectionNodes.current[id]);
      const contentNode = contentRef.current;
      if (sectionNode && contentNode) {
        sectionNode.measureLayout(
          contentNode,
          (_x, y) => {
            sectionOffsets.current[id] = y;
            scrollToY(y);
          },
          () => {
            const measuredY = sectionOffsets.current[id];
            if (measuredY !== undefined) scrollToY(measuredY);
          },
        );
        return;
      }

      const measuredY = sectionOffsets.current[id];
      if (measuredY !== undefined) scrollToY(measuredY);
    },
    [resolveScrollContainer, resolveSectionElement, visibleSectionIds],
  );

  return {
    scrollRef,
    contentRef,
    activeSection,
    registerSection,
    onSectionLayout,
    onScroll,
    scrollToSection,
    remeasureSections,
  };
}
