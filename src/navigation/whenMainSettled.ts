import { useAuthFlowStore } from '../stores/authFlowStore';
import { navigationRef } from './navigationRef';

/** After sign-in the root gate remounts Main and AuthReturnHandler settles; then navigate. */
export function whenMainSettled(): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      const root = navigationRef.isReady() ? navigationRef.getRootState()?.routes?.[0]?.name : null;
      const settled = root === 'Main' && useAuthFlowStore.getState().pendingReturn == null;
      if (settled || attempts > 160) {
        clearInterval(id);
        resolve();
      }
    }, 50);
  });
}
