import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { StorefrontArticlePage } from '../../components/storefront/StorefrontArticlePage';
import {
  DEFAULT_INCLUSIONS,
  StorefrontBuildBoxStrip,
} from '../../components/storefront/StorefrontBuildBoxStrip';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { StorefrontTopPicksAisles } from '../../components/storefront/StorefrontTopPicksAisles';
import {
  boxLockDayLabel,
  formatShortMonthDay,
  HANUKKAH_DELIVERY_FALLBACK_ISO,
  HANUKKAH_STARTS_FALLBACK_ISO,
} from '../../constants/hanukkahBoxLock';
import { giftLandingCopy } from '../../constants/storefrontGiftCopy';
import { borderRadius, MOBILE_GUTTER, spacing } from '../../constants/theme';
import { useBoxLockPassed } from '../../hooks/useBoxLockDay';
import type { MainStackParamList } from '../../navigation/types';
import { trackGiftStep } from '../../services/analytics/giftFunnel';
import { getHanukkahConfig, peekHanukkahConfig, type HanukkahConfig } from '../../services/firestore/config';
import type { GiftPath } from '../gift/giftGiveTypes';

type GiftLandingRoute = RouteProp<MainStackParamList, 'GiftLanding'>;

const CLOSED_IMAGE = require('../../../assets/storefront/box-feature-gift-stack-v2.webp');
const CLOSED_IMAGE_ASPECT = 819 / 1024;

function useHanukkahConfig(): HanukkahConfig | null {
  const [config, setConfig] = useState<HanukkahConfig | null>(() => peekHanukkahConfig());
  useEffect(() => {
    let cancelled = false;
    void getHanukkahConfig().then((next) => {
      if (!cancelled) setConfig(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}

/** `/gift` — what grandparent / gift ads land on. `?path=` still skips straight to the form. */
export function GiftLandingScreen() {
  const route = useRoute<GiftLandingRoute>();
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const preferredGiftPath = route.params?.preferredGiftPath;
  const config = useHanukkahConfig();
  const closed = useBoxLockPassed();
  const { goCategory } = useStorefrontActions();

  useEffect(() => {
    if (preferredGiftPath) {
      navigation.replace('GiftGive', { initialGiftPath: preferredGiftPath });
      return;
    }
    trackGiftStep('GiftPageView');
  }, [navigation, preferredGiftPath]);

  if (preferredGiftPath) return null;

  const c = giftLandingCopy({
    lockDay: boxLockDayLabel(config?.lockAt),
    arrivesBy:
      formatShortMonthDay(config?.estimatedDeliveryBy) ?? formatShortMonthDay(HANUKKAH_DELIVERY_FALLBACK_ISO)!,
    startsOn: formatShortMonthDay(config?.startsOn) ?? formatShortMonthDay(HANUKKAH_STARTS_FALLBACK_ISO)!,
  });

  const give = (initialGiftPath: GiftPath) => navigation.navigate('GiftGive', { initialGiftPath });
  const giveBox = () => give('customize');
  const giveCredit = () => give('credit_only');

  if (closed) {
    return (
      <StorefrontArticlePage
        eyebrow={c.eyebrow}
        title={c.title}
        lead={c.closed.lead}
        leadMaxWidth={560}
        leadBalance
        titleLarge
        primaryCta={{ label: c.closed.primaryCta, onPress: giveCredit }}
        primaryCtaSize="medium"
        showFooterStrips={false}
        blocks={[
          {
            type: 'node',
            node: (
              <View style={styles.closedImageWrap}>
                <View style={styles.closedImageFrame}>
                  <Image
                    source={CLOSED_IMAGE}
                    style={styles.closedImage}
                    resizeMode="cover"
                    accessibilityLabel="Wrapped Hanukkah presents with a book, a stuffie, a dreidel, and gelt"
                  />
                </View>
              </View>
            ),
          },
        ]}
      />
    );
  }

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      leadMaxWidth={560}
      leadBalance
      titleLarge
      primaryCta={{ label: c.primaryCta, onPress: giveBox }}
      secondaryCta={{ label: c.secondaryCta, onPress: giveCredit }}
      primaryCtaNote={c.smallPrint}
      primaryCtaSize="medium"
      showFooterStrips={false}
      blocks={[
        {
          type: 'node',
          node: (
            <StorefrontBuildBoxStrip
              onPress={giveBox}
              headline={c.inside.headline}
              body={c.inside.body}
              inclusions={DEFAULT_INCLUSIONS}
              ctaLabel={c.inside.videoCta}
              secondaryCtaLabel={c.inside.cta}
              flushBottom
            />
          ),
        },
        {
          type: 'node',
          node: (
            <StorefrontTopPicksAisles
              variant="aisles"
              onCategory={(category) => goCategory(category)}
              flushTop
            />
          ),
        },
        { type: 'steps', heading: c.howItWorks.heading, items: c.howItWorks.steps },
        { type: 'prose', body: c.howItWorks.after, maxWidth: 480, paddingBottom: spacing.lg },
        {
          type: 'band',
          heading: c.twoWays.heading,
          body: c.twoWays.body,
          cta: { label: c.twoWays.primaryCta, onPress: giveBox },
          secondaryCta: { label: c.twoWays.secondaryCta, onPress: giveCredit },
          paper: true,
        },
        { type: 'beliefs', heading: c.faq.heading, items: c.faq.items, roomy: true },
        {
          type: 'band',
          heading: c.closing.heading,
          body: c.closing.body,
          cta: { label: c.closing.cta, onPress: giveBox },
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  closedImageWrap: {
    width: '100%',
    maxWidth: 440 + MOBILE_GUTTER * 2,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.xl,
  },
  closedImageFrame: {
    width: '100%',
    aspectRatio: CLOSED_IMAGE_ASPECT,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  closedImage: {
    width: '100%',
    height: '100%',
  },
});
