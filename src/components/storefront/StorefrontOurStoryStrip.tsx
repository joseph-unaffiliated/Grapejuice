import React from 'react';
import { StorefrontPaperCardStrip } from './StorefrontPaperCardStrip';
import { useLayoutBreakpoint } from '../../hooks/useLayoutBreakpoint';

export const OUR_STORY_STRIP_HEADLINE =
  "Making it your own\ndoesn’t mean\ndoing it alone";
export const OUR_STORY_STRIP_BODY =
  'We started Grapejuice to remove all friction that stands between people and the Jewish practices they want to bring into their homes.';
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
  const { isCompact } = useLayoutBreakpoint();
  /** Soft breaks are mobile-only; desktop reads as one line. */
  const displayHeadline = isCompact ? headline : headline.replace(/\n+/g, ' ');

  return (
    <StorefrontPaperCardStrip
      headline={displayHeadline}
      body={body}
      primaryCta={{ label: primaryLabel, onPress: onLearnMore }}
      secondaryCta={{ label: secondaryLabel, onPress: onGiveGift }}
    />
  );
}
