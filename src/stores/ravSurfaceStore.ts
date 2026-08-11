import { create } from 'zustand';
import type { RavFocusedEntity } from '../services/rav/ravCopilotTypes';

/**
 * Screens publish what the user is looking at so Rav (overlay) can co-pilot.
 * Cleared on blur when leaving a focused surface.
 */
type RavSurfaceState = {
  focusedEntity: RavFocusedEntity | null;
  setFocusedEntity: (entity: RavFocusedEntity | null) => void;
};

export const useRavSurfaceStore = create<RavSurfaceState>((set) => ({
  focusedEntity: null,
  setFocusedEntity: (focusedEntity) => set({ focusedEntity }),
}));
