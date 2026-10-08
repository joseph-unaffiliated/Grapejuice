import { useCallback, useEffect } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';

const BODY_CLASS = 'gj-bottom-bar';
const HEIGHT_VAR = '--gj-bottom-bar-h';

/**
 * Web: while a full-width bottom bar is showing, lift OneTrust's floating cookie-settings
 * button above it (CSS in public/index.html). Attach the returned handler to the bar's onLayout.
 */
export function useCookieButtonClearance(active: boolean): (event: LayoutChangeEvent) => void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !active) return;
    const body = document.body;
    body.classList.add(BODY_CLASS);
    return () => {
      body.classList.remove(BODY_CLASS);
      body.style.removeProperty(HEIGHT_VAR);
    };
  }, [active]);

  return useCallback(
    (event: LayoutChangeEvent) => {
      if (Platform.OS !== 'web' || typeof document === 'undefined' || !active) return;
      const height = Math.ceil(event.nativeEvent.layout.height);
      if (height > 0) document.body.style.setProperty(HEIGHT_VAR, `${height}px`);
    },
    [active]
  );
}
