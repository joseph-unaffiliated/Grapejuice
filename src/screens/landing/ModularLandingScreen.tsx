import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontChrome } from '../../components/storefront/StorefrontChrome';
import { LandingComposeView } from '../../components/landing/LandingComposeView';
import {
  landingAudienceById,
  type LandingCtaAction,
} from '../../constants/landingAudiences';
import { semanticColors } from '../../constants/theme';
import { useLandingConfig } from '../../hooks/useLandingConfig';
import { usePreviewedHasStartedBox } from '../../hooks/useUserStatePreview';
import { useGuestSessionStore } from '../../stores/guestSessionStore';
import { useEntryContextStore } from '../../stores/entryContextStore';
import { useMockFlowStore } from '../../stores/mockFlowStore';
import type { MainStackParamList } from '../../navigation/types';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import type { GiftPath } from '../gift/giftGiveTypes';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  audienceId: string;
  /** Gift landing only — deep-link `?path=` can flip which gift CTA leads. */
  preferredGiftPath?: GiftPath | null;
  ravSurface: { id: string; label: string };
};

/**
 * Shared modular campaign landing — Firestore CMS override when present, else code-config.
 * Lifecycle visitors with a box go to My Box (skipped while mock flow is active).
 */
export function ModularLandingScreen({ audienceId, preferredGiftPath = null, ravSurface }: Props) {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const hasStartedBox = usePreviewedHasStartedBox();
  const mockFlowActive = useMockFlowStore((s) => s.active);
  const startBuildBox = useGuestSessionStore((s) => s.startBuildBox);
  const clearEntry = useEntryContextStore((s) => s.clear);
  const { config, loading: configLoading } = useLandingConfig(audienceId);
  const resolved = config ?? landingAudienceById(audienceId);

  usePublishRavSurface({ type: 'content', id: ravSurface.id, label: ravSurface.label });

  useEffect(() => {
    if (!hasStartedBox || mockFlowActive) return;
    clearEntry();
    navigation.replace('MyBox');
  }, [hasStartedBox, mockFlowActive, clearEntry, navigation]);

  const runAction = (action: LandingCtaAction) => {
    switch (action.type) {
      case 'gift_give':
        navigation.navigate('GiftGive', { initialGiftPath: action.giftPath });
        break;
      case 'start_box':
        startBuildBox();
        break;
      case 'store':
        navigation.navigate('StorefrontHome');
        break;
      case 'store_category':
        navigation.navigate('StorefrontCategory', { category: action.category });
        break;
      default:
        break;
    }
  };

  if (configLoading || !resolved) {
    return <View style={styles.boot} />;
  }

  if (hasStartedBox && !mockFlowActive) {
    return <View style={styles.boot} />;
  }

  return (
    <StorefrontChrome hideServicesNav>
      <LandingComposeView
        config={resolved}
        forceCompact={compact}
        preferredGiftPath={preferredGiftPath}
        onAction={runAction}
      />
    </StorefrontChrome>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: semanticColors.bgPrimary },
});
