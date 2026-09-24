import React from 'react';
import {
  BMITZVAH_STRIP_BODY,
  BMITZVAH_STRIP_HEADLINE,
  BMITZVAH_STRIP_PRIMARY_LABEL,
} from '../../constants/storefrontBMitzvahCopy';
import { StorefrontPaperCardStrip } from './StorefrontPaperCardStrip';

type Props = {
  onInterested: () => void;
  headline?: string;
  body?: string;
  primaryLabel?: string;
};

/**
 * Paper-texture promo strip — B'Mitzvah pilot interest.
 * Same shell as Passover / Our Story (grape mark only, cold-press paper, gold CTA).
 */
export function StorefrontBMitzvahStrip({
  onInterested,
  headline = BMITZVAH_STRIP_HEADLINE,
  body = BMITZVAH_STRIP_BODY,
  primaryLabel = BMITZVAH_STRIP_PRIMARY_LABEL,
}: Props) {
  return (
    <StorefrontPaperCardStrip
      headline={headline}
      body={body}
      primaryCta={{ label: primaryLabel, onPress: onInterested }}
    />
  );
}
