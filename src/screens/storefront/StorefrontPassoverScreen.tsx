import React from 'react';
import { Linking } from 'react-native';
import { StorefrontArticlePage } from '../../components/storefront/StorefrontArticlePage';
import { StorefrontBMitzvahStrip } from '../../components/storefront/StorefrontBMitzvahStrip';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { BMITZVAH_PILOT_INTEREST } from '../../constants/storefrontBMitzvahCopy';
import { PASSOVER_NOTIFY_INTEREST } from '../../constants/pilotHolidays';
import { STOREFRONT_PASSOVER_BOX_THUMBS } from '../../constants/storefrontMedia';
import { PASSOVER_COPY } from '../../constants/storefrontPassoverCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';

export function StorefrontPassoverScreen() {
  const { startBox } = useStorefrontActions();
  usePublishRavSurface({ type: 'content', id: 'passover-2027', label: 'Passover 2027' });
  const c = PASSOVER_COPY;
  const passover = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const bmitzvah = useStorefrontInterest(BMITZVAH_PILOT_INTEREST);

  const reserveInterest = () => {
    passover.mark();
  };

  const primaryLabel = passover.marked ? 'Done!' : c.primaryCta;

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      leadMaxWidth={520}
      primaryCta={{
        label: primaryLabel,
        onPress: reserveInterest,
        disabled: passover.marked,
      }}
      primaryCtaSize="medium"
      showHeroDivider
      buildBoxHeadline="build your hanukkah box"
      blocks={[
        {
          type: 'prose',
          heading: c.whatsInTheBox.heading,
          thumbs: STOREFRONT_PASSOVER_BOX_THUMBS,
          body: c.whatsInTheBox.body,
          showDividerAfter: true,
        },
        {
          type: 'roadmap',
          heading: c.roadmap.heading,
          groups: c.roadmap.groups.map((group) => ({
            items: group.items.map((item) => {
              const ctaLabel = 'ctaLabel' in item ? item.ctaLabel : undefined;
              const ctaAction = 'ctaAction' in item ? item.ctaAction : undefined;
              const isStartBox = ctaAction === 'startBox';
              const ctaVariant =
                'ctaVariant' in item && item.ctaVariant ? item.ctaVariant : undefined;
              const isPreRegister = Boolean(ctaLabel) && !isStartBox;
              const label =
                isPreRegister && passover.marked ? 'Done!' : ctaLabel;
              return {
                when: item.when,
                what: item.what,
                cta: label
                  ? {
                      label,
                      onPress: isStartBox ? startBox : reserveInterest,
                      disabled: isPreRegister && passover.marked,
                    }
                  : undefined,
                // Passover Pre-register = gold fill; Hanukkah + other holidays = outline
                ctaVariant: ctaLabel
                  ? ((ctaVariant ?? 'outline') as 'primary' | 'outline')
                  : undefined,
              };
            }),
          })),
        },
        {
          type: 'cta',
          heading: c.lunarCycle.heading,
          cta: {
            label: c.lunarCycle.ctaLabel,
            onPress: () => {
              void Linking.openURL(c.lunarCycle.url);
            },
          },
          ctaVariant: 'outline',
        },
      ]}
      beforeFooterStrips={
        <StorefrontBMitzvahStrip
          onInterested={() => bmitzvah.mark()}
          primaryLabel={bmitzvah.marked ? 'Done!' : undefined}
          disabled={bmitzvah.marked}
        />
      }
    />
  );
}
