import React from 'react';
import { StorefrontArticlePage } from '../../components/storefront/StorefrontArticlePage';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { HOW_TO_PLAY_DREIDEL_COPY } from '../../constants/storefrontHowToPlayDreidelCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

export function StorefrontHowToPlayDreidelScreen() {
  const { goCategory } = useStorefrontActions();
  usePublishRavSurface({
    type: 'content',
    id: 'how-to-play-dreidel',
    label: 'How to play dreidel',
  });
  const c = HOW_TO_PLAY_DREIDEL_COPY;

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      primaryCta={{
        label: 'Shop dreidels',
        onPress: () => goCategory('dreidels'),
      }}
      blocks={[
        { type: 'prose', heading: c.whyWePlay.heading, body: c.whyWePlay.body },
        {
          type: 'visualPlaceholder',
          label: c.visuals[0].label,
          aspectRatio: c.visuals[0].aspectRatio,
        },
        { type: 'prose', heading: c.setup.heading, body: c.setup.body },
        {
          type: 'steps',
          heading: c.steps.heading,
          items: [...c.steps.items],
        },
        {
          type: 'visualPlaceholder',
          label: c.visuals[1].label,
          aspectRatio: c.visuals[1].aspectRatio,
        },
        { type: 'prose', heading: c.letters.heading, body: c.letters.body },
      ]}
    />
  );
}
