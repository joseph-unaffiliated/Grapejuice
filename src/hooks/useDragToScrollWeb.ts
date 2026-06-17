import { useEffect, useRef, type RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

const DRAG_THRESHOLD_PX = 5;
export const HORIZONTAL_RAIL_DRAGGING_CLASS = 'gj-horizontal-rail-dragging';

type ScrollRef = RefObject<ScrollView | null>;

function getScrollableElement(ref: ScrollRef): HTMLElement | null {
  const node = ref.current as ScrollView | HTMLElement | null;
  if (!node) return null;

  if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
    return node;
  }

  const inst = node as ScrollView & { getScrollableNode?: () => HTMLElement };
  if (typeof inst.getScrollableNode === 'function') {
    return inst.getScrollableNode();
  }

  return null;
}

/** Desktop/web click-and-drag horizontal scroll for RN Web ScrollView rails. */
export function useDragToScrollWeb(scrollRef: ScrollRef): void {
  const dragRef = useRef({
    active: false,
    dragged: false,
    startX: 0,
    startScrollLeft: 0,
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let el: HTMLElement | null = null;
    let rafId = 0;
    let mounted = true;
    const cleanups: Array<() => void> = [];

    const attach = () => {
      if (!mounted) return;
      el = getScrollableElement(scrollRef);
      if (!el) {
        rafId = requestAnimationFrame(attach);
        return;
      }

      const drag = dragRef.current;

      const suppressClicksWithinRail = () => {
        let suppress = true;
        const onClick = (event: MouseEvent) => {
          if (!suppress || !el?.contains(event.target as Node)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          suppress = false;
        };
        document.addEventListener('click', onClick, true);
        window.setTimeout(() => {
          suppress = false;
          document.removeEventListener('click', onClick, true);
        }, 100);
      };

      const endDrag = () => {
        if (!drag.active) return;
        drag.active = false;
        el?.classList.remove(HORIZONTAL_RAIL_DRAGGING_CLASS);
        if (drag.dragged) {
          suppressClicksWithinRail();
        }
      };

      const onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) return;
        drag.active = true;
        drag.dragged = false;
        drag.startX = event.clientX;
        drag.startScrollLeft = el!.scrollLeft;
        el!.classList.add(HORIZONTAL_RAIL_DRAGGING_CLASS);
      };

      const onMouseMove = (event: MouseEvent) => {
        if (!drag.active) return;
        const deltaX = event.clientX - drag.startX;
        if (!drag.dragged && Math.abs(deltaX) > DRAG_THRESHOLD_PX) {
          drag.dragged = true;
        }
        if (drag.dragged) {
          event.preventDefault();
          el!.scrollLeft = drag.startScrollLeft - deltaX;
        }
      };

      const onMouseUp = () => endDrag();

      el.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      cleanups.push(() => {
        el?.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        el?.classList.remove(HORIZONTAL_RAIL_DRAGGING_CLASS);
      });
    };

    attach();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      cleanups.forEach((fn) => fn());
    };
  }, [scrollRef]);
}
