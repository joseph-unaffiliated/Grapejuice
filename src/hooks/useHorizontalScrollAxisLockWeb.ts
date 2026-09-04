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

/** px/ms — ignore tiny lifts so taps don't nudge the rail. */
const FLING_MIN_VELOCITY = 0.18;
/** Amplify release velocity slightly so quick swipes feel snappier. */
const FLING_VELOCITY_BOOST = 1.25;
/** Exponential decay rate (1/ms). Lower = longer, looser coast. */
const FLING_DECEL = 0.0032;
/** Stop when |v| falls below this (px/ms). */
const FLING_STOP_VELOCITY = 0.03;
/** EMA weight for new velocity samples while dragging. */
const VELOCITY_SMOOTH = 0.35;

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
 * After an X lock we drive `scrollLeft` in JS (mid-gesture touch-action changes are flaky),
 * and on release we run a short inertia fling so swipes coast instead of stopping cold.
 */
export function useHorizontalScrollAxisLockWeb(scrollRef: ScrollRef): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let el: HTMLElement | null = null;
    let rafId = 0;
    let momentumRaf = 0;
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
      let lastX = 0;
      let lastT = 0;
      /** Finger velocity in clientX space (px/ms). */
      let fingerVelocityX = 0;

      const clearLockClass = () => {
        el?.classList.remove(HORIZONTAL_RAIL_LOCKED_X_CLASS);
      };

      const stopMomentum = () => {
        if (momentumRaf) {
          cancelAnimationFrame(momentumRaf);
          momentumRaf = 0;
        }
      };

      const clampScrollLeft = (value: number) => {
        const max = Math.max(0, el!.scrollWidth - el!.clientWidth);
        return Math.max(0, Math.min(max, value));
      };

      const startMomentum = (scrollVelocityPxPerMs: number) => {
        stopMomentum();
        let v = scrollVelocityPxPerMs * FLING_VELOCITY_BOOST;
        if (Math.abs(v) < FLING_MIN_VELOCITY) return;

        let prev = performance.now();

        const tick = (now: number) => {
          if (!mounted || !el) {
            momentumRaf = 0;
            return;
          }
          const dt = Math.min(34, Math.max(0, now - prev));
          prev = now;

          const proposed = el.scrollLeft + v * dt;
          const next = clampScrollLeft(proposed);
          el.scrollLeft = next;
          const hitEdge = next !== proposed;

          // Exponential decay — feels looser than linear friction.
          v *= Math.exp(-FLING_DECEL * dt);

          if (hitEdge || Math.abs(v) < FLING_STOP_VELOCITY) {
            momentumRaf = 0;
            return;
          }
          momentumRaf = requestAnimationFrame(tick);
        };

        momentumRaf = requestAnimationFrame(tick);
      };

      const sampleFingerVelocity = (clientX: number, now: number) => {
        const dt = now - lastT;
        if (dt > 0 && dt < 64) {
          const instant = (clientX - lastX) / dt;
          fingerVelocityX =
            fingerVelocityX * (1 - VELOCITY_SMOOTH) + instant * VELOCITY_SMOOTH;
        }
        lastX = clientX;
        lastT = now;
      };

      const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        const t = event.touches[0]!;
        stopMomentum();
        lock = 'none';
        startX = t.clientX;
        startY = t.clientY;
        startScrollLeft = el!.scrollLeft;
        lastX = t.clientX;
        lastT = performance.now();
        fingerVelocityX = 0;
        clearLockClass();
      };

      const onTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        const t = event.touches[0]!;
        const now = performance.now();
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        sampleFingerVelocity(t.clientX, now);

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
        el!.scrollLeft = clampScrollLeft(startScrollLeft - (t.clientX - startX));
      };

      const onTouchEnd = () => {
        const wasLockedX = lock === 'x';
        lock = 'none';
        clearLockClass();
        if (!wasLockedX) return;
        // Finger right → scrollLeft decreases → fling velocity is -fingerVelocityX.
        startMomentum(-fingerVelocityX);
      };

      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchEnd, { passive: true });

      cleanups.push(() => {
        stopMomentum();
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
      if (momentumRaf) cancelAnimationFrame(momentumRaf);
      cleanups.forEach((fn) => fn());
    };
  }, [scrollRef]);
}
