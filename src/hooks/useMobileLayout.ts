/**
 * True when this visit should render the new mobile screens: phone width, the
 * `config/mobile` switch on (or `?mbx=new`), and not forced to control.
 *
 * Every switch point in the app is one line:
 *   if (useMobileLayout()) return <MobileThing />;
 *   return <DesktopThing />;
 * Desktop never evaluates to true (see mobileLayoutRules.ts).
 */
import { useEffect, useState } from 'react';
import { useLayoutBreakpoint } from './useLayoutBreakpoint';
import {
  getMobileLayoutEnabled,
  peekMobileLayoutEnabled,
  readMobileOverride,
  rememberLayoutForAnalytics,
  subscribeMobileLayoutEnabled,
} from '../services/mobileLayout/mobileLayoutConfig';
import { resolveMobileLayout } from '../services/mobileLayout/mobileLayoutRules';

function readBootEnabled(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem('gj.mobile.enabled');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    return null;
  }
  return null;
}

export function useMobileLayout(): boolean {
  const { isCompact } = useLayoutBreakpoint();
  const [enabled, setEnabled] = useState<boolean | null>(() => peekMobileLayoutEnabled() ?? readBootEnabled());
  const [override] = useState(() => readMobileOverride());

  useEffect(() => {
    if (!isCompact) return;
    let alive = true;
    void getMobileLayoutEnabled().then((v) => alive && setEnabled(v));
    const unsub = subscribeMobileLayoutEnabled((v) => alive && setEnabled(v));
    return () => {
      alive = false;
      unsub();
    };
  }, [isCompact]);

  const resolved = resolveMobileLayout({ isCompact, enabled, override });
  // While the switch is still unknown, stay on the phone layout so the desktop
  // page never flashes in before config loads.
  const isNew = resolved || (isCompact && enabled == null && override !== 'control');
  useEffect(() => {
    if (!isCompact) return;
    rememberLayoutForAnalytics(isNew);
  }, [isCompact, isNew]);
  return isNew;
}
