import { useEffect, type RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

/** Min movement before we commit to an axis (px). */
const AXIS_LOCK_PX = 8;
/**
 * Axis claim ratios (asymmetric on purpose):
 * - Horizontal only needs to slightly beat vertical → easier to pan the rail.
 * - Vertical must clearly dominate → page scroll doesn't steal mild diagonals.
 */
const HORIZONTAL_RATIO = 1.12;
const VERTICAL_RATIO = 1.45;

export const HORIZONTAL_RAIL_LOCKED_X_CLASS = 'gj-horizontal-rail-locked-x';

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

/**
 * Web touch axis lock for nested horizontal rails inside a vertical page scroller.
 *
 * Not a continuous sensitivity curve — each gesture picks an axis once, then sticks:
 * 1. Wait until the finger moves ~AXIS_LOCK_PX.
 * 2. If X clearly leads → lock horizontal (rail).
 * 3. If Y clearly leads → lock vertical (page).
 * 4. Mild X-leaning diagonals also take the rail; Y-leaning wait / go vertical.
 *
 * Default CSS is `touch-action: pan-y` so undecided pans prefer the page.
 * After an X lock we drive `scrollLeft` in JS (mid-gesture touch-action changes are flaky).
 */
export function useHorizontalScrollAxisLockWeb(scrollRef: ScrollRef): void {
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

      let lock: 'none' | 'x' | 'y' = 'none';
      let startX = 0;
      let startY = 0;
      let startScrollLeft = 0;

      const clearLockClass = () => {
        el?.classList.remove(HORIZONTAL_RAIL_LOCKED_X_CLASS);
      };

      const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        const t = event.touches[0]!;
        lock = 'none';
        startX = t.clientX;
        startY = t.clientY;
        startScrollLeft = el!.scrollLeft;
        clearLockClass();
      };

      const onTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        const t = event.touches[0]!;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (lock === 'none') {
          if (absX < AXIS_LOCK_PX && absY < AXIS_LOCK_PX) return;

          if (absX >= AXIS_LOCK_PX && absX > absY * HORIZONTAL_RATIO) {
            lock = 'x';
            el!.classList.add(HORIZONTAL_RAIL_LOCKED_X_CLASS);
            // Re-base so the lock threshold doesn't jump the rail.
            startX = t.clientX;
            startScrollLeft = el!.scrollLeft;
          } else if (absY >= AXIS_LOCK_PX && absY > absX * VERTICAL_RATIO) {
            lock = 'y';
            // Vertical wins — do not preventDefault; page scroller handles it.
            return;
          } else if (absX >= AXIS_LOCK_PX && absX >= absY) {
            // Mild diagonal with more X than Y — claim the rail.
            lock = 'x';
            el!.classList.add(HORIZONTAL_RAIL_LOCKED_X_CLASS);
            startX = t.clientX;
            startScrollLeft = el!.scrollLeft;
          } else {
            // Still ambiguous / vertical-leaning — wait for a clearer sample.
            return;
          }
        }

        if (lock === 'y') return;

        // lock === 'x'
        event.preventDefault();
        el!.scrollLeft = startScrollLeft - (t.clientX - startX);
      };

      const onTouchEnd = () => {
        lock = 'none';
        clearLockClass();
      };

      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchEnd, { passive: true });

      cleanups.push(() => {
        el?.removeEventListener('touchstart', onTouchStart);
        el?.removeEventListener('touchmove', onTouchMove);
        el?.removeEventListener('touchend', onTouchEnd);
        el?.removeEventListener('touchcancel', onTouchEnd);
        clearLockClass();
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
