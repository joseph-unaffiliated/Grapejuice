import { useEffect } from 'react';
import { useDevPreviewStore } from '../stores/devPreviewStore';
import { navigationRef } from './navigationRef';
import { applyDevPreview, readDevPreviewFromWindow } from './devPreview';
import { navigateMainStack, navigateMainTab } from './mainStackNavigation';

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

    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (!navigationRef.isReady()) {
        if (attempts > 80) clearInterval(id);
        return;
      }
      const root = navigationRef.getRootState();
      const onMain = root?.routes?.some((r) => r.name === 'Main');
      if (!onMain) {
        if (attempts > 80) clearInterval(id);
        return;
      }
      const nav = useDevPreviewStore.getState().consumePendingMainNav();
      if (!nav) {
        // Keep polling briefly — async seeds set pending after catalog load.
        if (attempts > 80) clearInterval(id);
        return;
      }
      clearInterval(id);

      if (nav.tab) {
        navigateMainTab(nav.tab, nav.tabParams);
        return;
      }

      navigateMainStack(nav.screen, nav.params);
    }, 50);

    return () => clearInterval(id);
  }, [enabled]);

  return null;
}
