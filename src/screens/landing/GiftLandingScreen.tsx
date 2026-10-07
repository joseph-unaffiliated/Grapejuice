import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  StorefrontArticlePage,
  type StorefrontArticleBlock,
} from '../../components/storefront/StorefrontArticlePage';
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

const HERO_IMAGE = require('../../../assets/storefront/box-feature-gift-stack-v2.webp');
const HERO_ASPECT = 819 / 1024;

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

  const heroImage: StorefrontArticleBlock = {
    type: 'node',
    node: (
      <View style={styles.heroImageWrap}>
        <View style={styles.heroImageFrame}>
          <Image
            source={HERO_IMAGE}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityLabel="Wrapped Hanukkah presents with a book, a stuffie, a dreidel, and gelt"
          />
        </View>
      </View>
    ),
  };

  if (closed) {
    return (
      <StorefrontArticlePage
        eyebrow={c.eyebrow}
        title={c.title}
        lead={c.closed.lead}
        leadMaxWidth={560}
        primaryCta={{ label: c.closed.primaryCta, onPress: giveCredit }}
        primaryCtaSize="medium"
        showFooterStrips={false}
        blocks={[heroImage]}
      />
    );
  }

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      leadMaxWidth={560}
      primaryCta={{ label: c.primaryCta, onPress: giveBox }}
      secondaryCta={{ label: c.secondaryCta, onPress: giveCredit }}
      primaryCtaNote={c.smallPrint}
      primaryCtaSize="medium"
      showFooterStrips={false}
      blocks={[
        heroImage,
        { type: 'prose', heading: c.inside.heading, body: c.inside.intro, maxWidth: 480, paddingBottom: 0 },
        { type: 'beliefs', items: c.inside.items },
        { type: 'prose', body: c.inside.menorahNote, maxWidth: 480, paddingBottom: spacing.lg },
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
        { type: 'beliefs', heading: c.faq.heading, items: c.faq.items },
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
  heroImageWrap: {
    width: '100%',
    maxWidth: 440 + MOBILE_GUTTER * 2,
    alignSelf: 'center',
    paddingHorizontal: MOBILE_GUTTER,
    marginBottom: spacing.xl,
  },
  heroImageFrame: {
    width: '100%',
    aspectRatio: HERO_ASPECT,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
});
