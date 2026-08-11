import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRavSurfaceStore } from '../stores/ravSurfaceStore';
import type { RavFocusedEntity } from '../services/rav/ravCopilotTypes';

/** Publish (and clear on blur) what Rav should treat as the on-screen focus. */
export function usePublishRavSurface(entity: RavFocusedEntity | null) {
  const setFocusedEntity = useRavSurfaceStore((s) => s.setFocusedEntity);

  useFocusEffect(
    useCallback(() => {
      setFocusedEntity(entity);
      return () => {
        // Only clear if we still own the same focus (avoid wiping a newer screen).
        const current = useRavSurfaceStore.getState().focusedEntity;
        if (
          entity &&
          current &&
          current.type === entity.type &&
          current.id === entity.id
        ) {
          setFocusedEntity(null);
        } else if (!entity) {
          setFocusedEntity(null);
        }
      };
    }, [entity?.type, entity?.id, entity?.label, setFocusedEntity])
  );
}
