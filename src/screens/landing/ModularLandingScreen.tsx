import React, { useMemo } from 'react';
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
import { usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import { useOwnBoxStep } from '../../hooks/useOwnBoxStep';
import { openBoxSurface } from '../../navigation/boxEntry';
import { applyOwnBoxCtaCopy } from './landingBoxCtas';
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
 * Always renders the page (footer, refresh, and inbound URLs). Own-box CTAs are
 * relabelled for progress; gift CTAs stay as authored.
 */
export function ModularLandingScreen({
  audienceId,
  preferredGiftPath = null,
  ravSurface,
}: Props) {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const isAuthenticated = usePreviewedIsAuthenticated();
  const { config, loading: configLoading } = useLandingConfig(audienceId);
  const resolved = config ?? landingAudienceById(audienceId);
  const ownBoxStep = useOwnBoxStep();

  // Own-box CTAs speak to where the visitor actually is; gift CTAs stay as authored.
  const composed = useMemo(
    () =>
      resolved
        ? { ...resolved, sections: applyOwnBoxCtaCopy(resolved.sections, ownBoxStep) }
        : null,
    [resolved, ownBoxStep]
  );

  usePublishRavSurface({ type: 'content', id: ravSurface.id, label: ravSurface.label });

  const runAction = (action: LandingCtaAction) => {
    switch (action.type) {
      case 'gift_give':
        navigation.navigate('GiftGive', { initialGiftPath: action.giftPath });
        break;
      case 'start_box':
        // Keep the destination honest with the relabelled CTA: "add payment to
        // secure your box" has to land on checkout, not the box itself.
        if (ownBoxStep === 'needs_payment') {
          navigation.navigate('Checkout');
          break;
        }
        // Reachable by someone who already has a box, so route through the
        // shared entry rather than restarting a build the gate would reject.
        openBoxSurface(isAuthenticated);
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

  if (configLoading || !composed) {
    return <View style={styles.boot} />;
  }

  return (
    <StorefrontChrome hideServicesNav>
      <LandingComposeView
        config={composed}
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
