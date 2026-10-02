import React, { useEffect, useState, type RefObject } from 'react';
import { Platform, Text, View, StyleSheet } from 'react-native';

/**
 * Web: pixel height for the storefront scroll host, pinned to the layout
 * viewport (`window.innerHeight` minus the host's top offset).
 *
 * iOS (Chrome / WKWebView) can resolve `height: 100%` / `100svh` short of the
 * real screen, leaving a dead band at the bottom that neither paints page
 * content nor scrolls. `innerHeight` tracks the layout viewport that fixed
 * elements use, so the scroller always reaches the true bottom.
 *
 * Returns null on native, when disabled (e.g. inside a tab layout whose tab
 * bar owns the bottom), or before the first measurement.
 */
export function useViewportPinnedHeight(
  hostRef: RefObject<View | null>,
  enabled: boolean
): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') {
      setHeight(null);
      return;
    }
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const node = hostRef.current as unknown as HTMLElement | null;
      const top = node?.getBoundingClientRect ? Math.max(0, node.getBoundingClientRect().top) : 0;
      const next = Math.round(window.innerHeight - top);
      setHeight((prev) => (next > 0 && next !== prev ? next : prev));
    };
    // iOS toolbar / keyboard transitions report intermediate sizes; re-read once settled.
    const syncSoon = () => {
      sync();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(sync, 350);
    };
    sync();
    const vv = window.visualViewport;
    window.addEventListener('resize', syncSoon);
    window.addEventListener('orientationchange', syncSoon);
    window.addEventListener('pageshow', syncSoon);
    document.addEventListener('focusout', syncSoon);
    document.addEventListener('visibilitychange', syncSoon);
    vv?.addEventListener('resize', syncSoon);
    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener('resize', syncSoon);
      window.removeEventListener('orientationchange', syncSoon);
      window.removeEventListener('pageshow', syncSoon);
      document.removeEventListener('focusout', syncSoon);
      document.removeEventListener('visibilitychange', syncSoon);
      vv?.removeEventListener('resize', syncSoon);
    };
  }, [enabled, hostRef]);

  return height;
}

function isViewportDebugOn(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return /[?&]gjdebug=1\b/.test(window.location.search);
}

function probeUnit(unit: string): number {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:0;left:-9999px;width:1px;height:${unit};visibility:hidden;pointer-events:none`;
  document.body.appendChild(el);
  const h = Math.round(el.getBoundingClientRect().height);
  el.remove();
  return h;
}

function describe(el: Element | null): string {
  if (!el) return 'none';
  const r = el.getBoundingClientRect();
  const id = el.id ? `#${el.id}` : '';
  const testId = el.getAttribute('data-testid');
  return `${el.tagName.toLowerCase()}${id}${testId ? `[${testId}]` : ''} ${Math.round(r.top)}-${Math.round(r.bottom)}`;
}

/** `?gjdebug=1` — on-device viewport readout for diagnosing iOS layout gaps. */
export function StorefrontViewportDebug({ pinnedHeight }: { pinnedHeight: number | null }) {
  const [on] = useState(isViewportDebugOn);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!on) return;
    const read = () => {
      const host = document.querySelector('[data-testid="storefront-scroll-host"]');
      const scroll = document.querySelector('[data-testid="storefront-vertical-scroll"]');
      const vv = window.visualViewport;
      const w = window.innerWidth;
      const chain: string[] = [];
      let p = host?.parentElement ?? null;
      while (p && chain.length < 8) {
        chain.push(String(Math.round(p.getBoundingClientRect().height)));
        p = p.parentElement;
      }
      setLines([
        `inner ${window.innerWidth}x${window.innerHeight}  screen ${screen.width}x${screen.height}`,
        `vv h ${Math.round(vv?.height ?? 0)} top ${Math.round(vv?.offsetTop ?? 0)}  docEl ${document.documentElement.clientHeight}`,
        `svh ${probeUnit('100svh')} dvh ${probeUnit('100dvh')} lvh ${probeUnit('100lvh')} vh ${probeUnit('100vh')}`,
        `pinned ${pinnedHeight ?? 'off'}`,
        `host ${describe(host)}`,
        `scroll ${describe(scroll)}`,
        `parents ${chain.join(' ')}`,
        `at -80: ${describe(document.elementFromPoint(w / 2, window.innerHeight - 80))}`,
        `at -20: ${describe(document.elementFromPoint(w / 2, window.innerHeight - 20))}`,
      ]);
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [on, pinnedHeight]);

  if (!on) return null;
  return (
    <View style={debugStyles.box} pointerEvents="none">
      {lines.map((l) => (
        <Text key={l} style={debugStyles.line}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const debugStyles = StyleSheet.create({
  box: {
    position: 'fixed' as unknown as 'absolute',
    top: 4,
    left: 4,
    right: 4,
    zIndex: 2147483647,
    backgroundColor: 'rgba(0,0,0,0.78)',
    padding: 6,
    borderRadius: 6,
  },
  line: {
    color: '#7CFC8A',
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Menlo, monospace',
  },
});
