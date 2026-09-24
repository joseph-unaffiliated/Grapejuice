import React from 'react';
import { StorefrontArticlePage } from '../../components/storefront/StorefrontArticlePage';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { HOW_TO_LIGHT_CANDLES_COPY } from '../../constants/storefrontHowToLightCandlesCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

export function StorefrontHowToLightCandlesScreen() {
  const { goCategory } = useStorefrontActions();
  usePublishRavSurface({
    type: 'content',
    id: 'how-to-light-candles',
    label: 'How to light Hanukkah candles',
  });
  const c = HOW_TO_LIGHT_CANDLES_COPY;

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      primaryCta={{
        label: 'Shop menorahs',
        onPress: () => goCategory('menorahs'),
      }}
      secondaryCta={{
        label: 'Shop candles',
        onPress: () => goCategory('candles'),
      }}
      blocks={[
        { type: 'prose', heading: c.placement.heading, body: c.placement.body },
        { type: 'prose', heading: c.shamash.heading, body: c.shamash.body },
        {
          type: 'visualPlaceholder',
          label: c.visuals[0].label,
          aspectRatio: c.visuals[0].aspectRatio,
        },
        {
          type: 'steps',
          heading: c.firstNight.heading,
          items: [...c.firstNight.items],
        },
        {
          type: 'prose',
          heading: c.songs.heading,
          body: c.songs.body,
        },
        {
          type: 'beliefs',
          items: [...c.songs.items],
        },
        { type: 'prose', heading: c.after.heading, body: c.after.body },
        {
          type: 'visualPlaceholder',
          label: c.visuals[1].label,
          aspectRatio: c.visuals[1].aspectRatio,
        },
        { type: 'prose', heading: c.nights2to8.heading, body: c.nights2to8.body },
      ]}
    />
  );
}
