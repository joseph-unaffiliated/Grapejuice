import { useEffect } from 'react';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { navigationRef } from './navigationRef';
import { applyDevPreview, readDevPreviewFromWindow } from './devPreview';

export function DevPreviewEffect() {
  const enabled = useDevPreviewStore((s) => s.enabled);

  useEffect(() => {
    const parsed = readDevPreviewFromWindow();
    if (parsed) {
      useDevPreviewStore.getState().applyPreview(parsed.key);
      applyDevPreview(parsed.key, parsed.search);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      if (!navigationRef.isReady()) return;
      const nav = useDevPreviewStore.getState().consumePendingMainNav();
      if (!nav) return;
      clearInterval(id);

      if (nav.tab) {
        navigationRef.navigate('Main', {
          screen: 'MainTabs',
          params: {
            screen: nav.tab,
            params: nav.tabParams,
          },
        });
        return;
      }

      navigationRef.navigate('Main', {
        screen: nav.screen,
        params: nav.params,
      });
    }, 50);

    return () => clearInterval(id);
  }, [enabled]);

  return null;
}
