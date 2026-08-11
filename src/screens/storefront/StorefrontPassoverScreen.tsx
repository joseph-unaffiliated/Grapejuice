import React from 'react';
import { StorefrontContentPage } from '../../components/storefront/StorefrontContentPage';
import { useStorefrontActions } from '../../components/storefront/StorefrontChrome';
import { usePublishRavSurface } from '../../hooks/usePublishRavSurface';

/** Placeholder — marketplace “2027 Passover” page. Content TBD. */
export function StorefrontPassoverScreen() {
  const { startBox, goEligibility } = useStorefrontActions();
  usePublishRavSurface({ type: 'content', id: 'passover-2027', label: 'Passover 2027' });

  return (
    <StorefrontContentPage
      crumb="2027 Passover"
      eyebrow="Seasonal boxes"
      title="Passover 2027"
      lead="Pre-registration, timing, and how Hanukkah box members carry forward. Full details coming soon."
      sections={[
        {
          heading: 'What’s coming',
          body: 'Placeholder — Passover box plans, waitlist, and what early interest unlocks. We’ll replace this with real dates and offers.',
        },
        {
          heading: 'From Hanukkah to Passover',
          body: 'Placeholder — how box membership and eligibility connect across seasons.',
        },
      ]}
      primaryCta={{ label: 'Build a Hanukkah box', onPress: startBox }}
      secondaryCta={{
        label: 'See box discount eligibility',
        onPress: goEligibility,
      }}
    />
  );
}
