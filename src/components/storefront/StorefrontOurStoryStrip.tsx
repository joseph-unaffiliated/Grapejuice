import React from 'react';
import { StorefrontPaperCardStrip } from './StorefrontPaperCardStrip';

export const OUR_STORY_STRIP_HEADLINE =
  "Making it your own\ndoesn’t mean doing it alone";
export const OUR_STORY_STRIP_BODY =
  'We started Grapejuice to remove all friction that stands between people and the Jewish practices they want to bring into their homes, as defined by them.';
export const OUR_STORY_STRIP_PRIMARY_LABEL = 'Learn more about us';
export const OUR_STORY_STRIP_SECONDARY_LABEL = 'Give the gift of Hanukkah';

type Props = {
  onLearnMore: () => void;
  onGiveGift: () => void;
  headline?: string;
  body?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
};

/**
 * Paper-texture promo strip — Our Story + gift CTAs.
 * Shell matches Ask Rav; no input, no whole-card press.
 * Logo: grape mark only (no wordmark text).
 */
export function StorefrontOurStoryStrip({
  onLearnMore,
  onGiveGift,
  headline = OUR_STORY_STRIP_HEADLINE,
  body = OUR_STORY_STRIP_BODY,
  primaryLabel = OUR_STORY_STRIP_PRIMARY_LABEL,
  secondaryLabel = OUR_STORY_STRIP_SECONDARY_LABEL,
}: Props) {
  return (
    <StorefrontPaperCardStrip
      headline={headline}
      body={body}
      primaryCta={{ label: primaryLabel, onPress: onLearnMore }}
      secondaryCta={{ label: secondaryLabel, onPress: onGiveGift }}
    />
  );
}
