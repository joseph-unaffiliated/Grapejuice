import React from 'react';
import {
  StorefrontArticlePage,
  type StorefrontArticleProseParagraph,
} from '../../components/storefront/StorefrontArticlePage';
import { PRIVACY_COPY } from '../../constants/storefrontPrivacyCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

export function StorefrontPrivacyScreen() {
  usePublishRavSurface({ type: 'content', id: 'privacy', label: 'Privacy Policy' });
  const c = PRIVACY_COPY;

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      showFooterStrips={false}
      blocks={c.sections.map((section) => ({
        type: 'prose' as const,
        heading: section.heading,
        body: section.body as readonly StorefrontArticleProseParagraph[],
        align: 'left' as const,
      }))}
    />
  );
}
