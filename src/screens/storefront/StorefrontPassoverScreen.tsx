import React from 'react';
import { Linking } from 'react-native';
import { StorefrontArticlePage } from '../../components/storefront/StorefrontArticlePage';
import { StorefrontBMitzvahStrip } from '../../components/storefront/StorefrontBMitzvahStrip';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { BMITZVAH_PILOT_INTEREST } from '../../constants/storefrontBMitzvahCopy';
import {
  HANUKKAH_2027_NOTIFY_INTEREST,
  HIGH_HOLIDAYS_SUKKOT_2027_INTEREST,
  PASSOVER_NOTIFY_INTEREST,
  PRE_REGISTERED_CTA_LABEL,
} from '../../constants/pilotHolidays';
import { STOREFRONT_PASSOVER_BOX_THUMBS } from '../../constants/storefrontMedia';
import { PASSOVER_COPY } from '../../constants/storefrontPassoverCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';

export function StorefrontPassoverScreen() {
  const { startBox } = useStorefrontActions();
  usePublishRavSurface({ type: 'content', id: 'passover-2027', label: 'Passover 2027' });
  const c = PASSOVER_COPY;
  const passover = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const highHolidays = useStorefrontInterest(HIGH_HOLIDAYS_SUKKOT_2027_INTEREST);
  const hanukkah2027 = useStorefrontInterest(HANUKKAH_2027_NOTIFY_INTEREST);
  const bmitzvah = useStorefrontInterest(BMITZVAH_PILOT_INTEREST);

  const interestByKey: Record<string, ReturnType<typeof useStorefrontInterest>> = {
    [PASSOVER_NOTIFY_INTEREST]: passover,
    [HIGH_HOLIDAYS_SUKKOT_2027_INTEREST]: highHolidays,
    [HANUKKAH_2027_NOTIFY_INTEREST]: hanukkah2027,
  };

  const primaryLabel = passover.marked ? PRE_REGISTERED_CTA_LABEL : c.primaryCta;

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      leadMaxWidth={520}
      primaryCta={{
        label: primaryLabel,
        onPress: passover.toggle,
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
              const interestKey = 'interestKey' in item ? item.interestKey : undefined;
              const isStartBox = ctaAction === 'startBox';
              const ctaVariant =
                'ctaVariant' in item && item.ctaVariant ? item.ctaVariant : undefined;
              const interest = interestKey ? interestByKey[interestKey] : undefined;
              const marked = Boolean(interest?.marked);
              const label = marked ? PRE_REGISTERED_CTA_LABEL : ctaLabel;
              return {
                when: item.when,
                what: item.what,
                cta: label
                  ? {
                      label,
                      onPress: isStartBox
                        ? startBox
                        : interest
                          ? interest.toggle
                          : passover.toggle,
                    }
                  : undefined,
                // Marked pre-registers use gold fill; otherwise Passover primary / others outline.
                ctaVariant: ctaLabel
                  ? ((marked || ctaVariant === 'primary' ? 'primary' : 'outline') as
                      | 'primary'
                      | 'outline')
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
          onInterested={bmitzvah.toggle}
          primaryLabel={bmitzvah.marked ? "You're interested!" : undefined}
        />
      }
    />
  );
}
