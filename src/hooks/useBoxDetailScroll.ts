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

function sectionDataSelector(id: BoxDisplaySectionId): string {
  return `[data-gj-section="${id}"]`;
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

let activeScrollAnim = 0;

function scrollWebContainer(scrollEl: HTMLElement, top: number, smooth = true) {
  const y = Math.max(0, top);
  if (isRootScrollElement(scrollEl)) {
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
    return;
  }
  if (!smooth) {
    scrollEl.scrollTop = y;
    return;
  }
  // RN Web ignores element.scrollTo({ behavior: 'smooth' }) — animate scrollTop ourselves.
  const start = readScrollTop(scrollEl);
  const delta = y - start;
  if (Math.abs(delta) < 1) {
    scrollEl.scrollTop = y;
    return;
  }
  const animId = ++activeScrollAnim;
  const durationMs = Math.min(550, Math.max(280, Math.abs(delta) * 0.35));
  const t0 = performance.now();
  const step = (now: number) => {
    if (animId !== activeScrollAnim) return;
    const t = Math.min(1, (now - t0) / durationMs);
    // easeInOutCubic
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    scrollEl.scrollTop = start + delta * eased;
    if (t < 1) requestAnimationFrame(step);
    else scrollEl.scrollTop = y;
  };
  requestAnimationFrame(step);
}

function asView(node: unknown): View | null {
  return node && typeof node === 'object' && 'measureLayout' in node ? (node as View) : null;
}

function sectionOffsetInScrollport(sectionEl: HTMLElement, scrollEl: HTMLElement): number {
  return (
    sectionEl.getBoundingClientRect().top -
    scrollEl.getBoundingClientRect().top +
    readScrollTop(scrollEl)
  );
}

/**
 * Scroll-spy + scroll-to for box section tabs (not a content filter).
 *
 * Web: always scroll THIS screen's ScrollView node (`.gj-box-scroll`). Do not walk
 * ancestors looking for overflow:visible parents — that was a guest-banner glow
 * compromise that made every tab jump clamp to y=0 (Candles / top).
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

  const getScrollElement = useCallback((): HTMLElement | null => {
    if (Platform.OS !== 'web') return null;
    const host = scrollRef.current as unknown as HostNode | null;
    const fromRef = host?.getScrollableNode?.() ?? null;
    if (fromRef) return fromRef;
    // className is stripped on RN Web ScrollView; testID is reliable.
    return document.querySelector<HTMLElement>('[data-testid="box-vertical-scroll"]');
  }, []);

  const resolveSectionElement = useCallback(
    (id: BoxDisplaySectionId): HTMLElement | null => {
      const registered = sectionNodes.current[id];
      if (isDomElement(registered)) return registered;

      if (Platform.OS !== 'web') return null;

      const root = getScrollElement();
      if (root) {
        const byData = root.querySelector(sectionDataSelector(id));
        if (byData instanceof HTMLElement) return byData;
        const byId = root.querySelector(`#${sectionDomId(id)}`);
        if (byId instanceof HTMLElement) return byId;
      }
      return null;
    },
    [getScrollElement],
  );

  const registerSection = useCallback((id: BoxDisplaySectionId, node: unknown) => {
    sectionNodes.current[id] = node ?? null;
  }, []);

  const measureSectionOffset = useCallback(
    (id: BoxDisplaySectionId) => {
      if (Platform.OS === 'web') {
        const sectionEl = resolveSectionElement(id);
        const scrollEl = getScrollElement();
        if (sectionEl && scrollEl) {
          sectionOffsets.current[id] = sectionOffsetInScrollport(sectionEl, scrollEl);
          return;
        }
      }

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
    },
    [getScrollElement, resolveSectionElement],
  );

  const onSectionLayout = useCallback(
    (id: BoxDisplaySectionId) => (_e: LayoutChangeEvent) => {
      // Do not trust e.nativeEvent.layout.y — on desktop it is relative to the
      // list column, not the ScrollView content root, so every tab looked like y≈0.
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
        const top = sectionOffsetInScrollport(el, scrollEl);
        sectionOffsets.current[id] = top;
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

      scrollEl = getScrollElement();
      if (!scrollEl) {
        raf = requestAnimationFrame(attach);
        return;
      }

      const onScrollEvent = () => updateActiveFromDom(scrollEl!);
      const scrollTarget = isRootScrollElement(scrollEl) ? window : scrollEl;
      scrollTarget.addEventListener('scroll', onScrollEvent, { passive: true });
      removeListener = () => scrollTarget.removeEventListener('scroll', onScrollEvent);
      updateActiveFromDom(scrollEl);
    };

    attach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      removeListener?.();
    };
  }, [contentReady, getScrollElement, updateActiveFromDom]);

  const scrollToSection = useCallback(
    (id: BoxDisplaySectionId) => {
      if (!visibleSectionIds.includes(id)) return;

      setActiveSection(id);
      scrollingToSection.current = true;

      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
      scrollEndTimer.current = setTimeout(() => {
        scrollingToSection.current = false;
        // Re-measure after the smooth scroll settles so spy stays accurate.
        measureSectionOffset(id);
      }, 700);

      if (Platform.OS === 'web') {
        const sectionEl = resolveSectionElement(id);
        const scrollEl = getScrollElement();
        if (sectionEl && scrollEl) {
          const canScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
          if (!canScroll) {
            // Scrollport grew to content height (flex min-size bug) — native scrollTo is a
            // no-op. scrollIntoView still moves whatever ancestor actually scrolls.
            sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          const y = Math.max(
            0,
            sectionOffsetInScrollport(sectionEl, scrollEl) - BOX_DETAIL_SCROLL_SPY_OFFSET,
          );
          scrollWebContainer(scrollEl, y, true);
          return;
        }
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

      const measuredY = sectionOffsets.current[id];
      if (measuredY !== undefined) {
        scrollToY(measuredY);
        return;
      }

      const sectionNode = asView(sectionNodes.current[id]);
      const contentNode = contentRef.current;
      if (sectionNode && contentNode) {
        sectionNode.measureLayout(
          contentNode,
          (_x, y) => {
            sectionOffsets.current[id] = y;
            scrollToY(y);
          },
          () => {},
        );
      }
    },
    [getScrollElement, measureSectionOffset, resolveSectionElement, visibleSectionIds],
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
