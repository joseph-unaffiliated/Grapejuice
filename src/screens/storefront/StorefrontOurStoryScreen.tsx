import React from 'react';
import { StorefrontContentPage } from '../../components/storefront/StorefrontContentPage';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

/** Placeholder — marketplace “Our story” page. Content TBD. */
export function StorefrontOurStoryScreen() {
  const { goCategory, startBox } = useStorefrontActions();
  usePublishRavSurface({ type: 'content', id: 'our-story', label: 'Our Story' });

  return (
    <StorefrontContentPage
      crumb="Our story"
      eyebrow="Company"
      title="Our story"
      lead="Why Grapejuice exists, how we build seasonal boxes, and what we’re building toward. Full story coming soon."
      sections={[
        {
          heading: 'Built for households, not holidays alone',
          body: 'Placeholder — we’ll fill this with how Grapejuice started and what we believe about celebrating Jewish life at home.',
        },
        {
          heading: 'A marketplace with a point of view',
          body: 'Placeholder — curation, Rav, and the Hanukkah box as one system. Copy to follow.',
        },
      ]}
      primaryCta={{ label: 'Shop the collection', onPress: () => goCategory('collection') }}
      secondaryCta={{ label: 'Build a Hanukkah box', onPress: startBox }}
    />
  );
}
