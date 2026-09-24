import React from 'react';
import { Linking } from 'react-native';
import {
  StorefrontArticlePage,
  type StorefrontArticleBeliefSection,
} from '../../components/storefront/StorefrontArticlePage';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { OUR_STORY_COPY } from '../../constants/storefrontOurStoryCopy';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

export function StorefrontOurStoryScreen() {
  const { startBox, goHome } = useStorefrontActions();
  usePublishRavSurface({ type: 'content', id: 'our-story', label: 'Our Story' });
  const c = OUR_STORY_COPY;

  return (
    <StorefrontArticlePage
      eyebrow={c.eyebrow}
      title={c.title}
      lead={c.lead}
      buildBoxHeadline="build your hanukkah box"
      blocks={[
        {
          type: 'beliefs',
          heading: c.beliefs.heading,
          sections: c.beliefs.sections as unknown as StorefrontArticleBeliefSection[],
          paper: true,
        },
        { type: 'prose', heading: c.team.heading, body: c.team.body },
        { type: 'prose', heading: c.listening.heading, body: c.listening.body },
        {
          type: 'band',
          heading: c.give.heading,
          body: c.give.body,
          cta: { label: 'Shop the collection', onPress: goHome },
          paper: true,
        },
        {
          type: 'linkList',
          heading: c.involve.heading,
          items: [
            { label: c.involve.items[0].label, detail: c.involve.items[0].detail, onPress: goHome },
            { label: c.involve.items[1].label, detail: c.involve.items[1].detail, onPress: startBox },
            {
              label: c.involve.items[2].label,
              detail: c.involve.items[2].detail,
              onPress: () => {
                void Linking.openURL('https://www.instagram.com/');
              },
            },
            {
              label: c.involve.items[3].label,
              detail: c.involve.items[3].detail,
              onPress: () => {
                void Linking.openURL('mailto:hello@grapejuice.co?subject=Joining%20the%20team');
              },
            },
            {
              label: c.involve.items[4].label,
              detail: c.involve.items[4].detail,
              onPress: () => {
                void Linking.openURL('mailto:hello@grapejuice.co?subject=Press');
              },
            },
            {
              label: c.involve.items[5].label,
              detail: c.involve.items[5].detail,
              onPress: () => {
                void Linking.openURL('mailto:hello@grapejuice.co?subject=Newsletter');
              },
            },
          ],
        },
      ]}
    />
  );
}
