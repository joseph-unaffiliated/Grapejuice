import React from 'react';
import { StorefrontArticlePage } from '../../components/storefront/StorefrontArticlePage';
import { StorefrontBMitzvahStrip } from '../../components/storefront/StorefrontBMitzvahStrip';
import { useHolidayRoadmapBlocks } from '../../components/storefront/useHolidayRoadmapBlocks';
import { BMITZVAH_PILOT_INTEREST } from '../../constants/storefrontBMitzvahCopy';
import {
  PASSOVER_NOTIFY_INTEREST,
  PRE_REGISTERED_CTA_LABEL,
  PRE_REGISTERED_NOTE,
} from '../../constants/pilotHolidays';
import { STOREFRONT_PASSOVER_BOX_THUMBS } from '../../constants/storefrontMedia';
import { PASSOVER_COPY } from '../../constants/storefrontPassoverCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';

export function StorefrontPassoverScreen() {
  usePublishRavSurface({ type: 'content', id: 'passover-2027', label: 'Passover 2027' });
  const c = PASSOVER_COPY;
  const passover = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const bmitzvah = useStorefrontInterest(BMITZVAH_PILOT_INTEREST);
  const roadmapBlocks = useHolidayRoadmapBlocks();

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
      primaryCtaNote={passover.marked ? PRE_REGISTERED_NOTE : undefined}
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
        ...roadmapBlocks,
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
