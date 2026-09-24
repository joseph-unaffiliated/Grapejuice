import type { StorefrontHomeMode } from '../hooks/useStorefrontHomeMode';

const PASSOVER_STRIP_BG = require('../../assets/storefront/setthetablev1.webp');

export type StorefrontBuildBoxStripCopy = {
  headline: string;
  body: string;
  ctaLabel: string;
  backgroundSource?: number;
};

/** Mode-aware copy for the lifestyle build/save box strip (home + category PLP). */
export function storefrontBuildBoxStripCopy(
  mode: StorefrontHomeMode
): StorefrontBuildBoxStripCopy | null {
  switch (mode) {
    case 'guest_box':
      return {
        headline: 'Save your Personalized Hanukkah Box',
        body: 'Your box is started. Create an account so we can hold your curation and lock date — pick up right where you left off on any device.',
        ctaLabel: 'Create an account',
      };
    case 'customize':
      return {
        headline: 'Customize your Hanukkah Box',
        body: 'Your box is secured. Swap pieces and add extras anytime before lock — then we ship a week or two before the first night.',
        ctaLabel: 'Customize your box',
      };
    case 'needs_payment':
      return {
        headline: 'Secure your Hanukkah Box',
        body: 'Add payment to lock in your picks. You can browse swaps now — you won’t be charged until your box ships.',
        ctaLabel: 'Add payment to secure',
      };
    case 'gift_credit_incomplete':
      return {
        headline: 'Finish your gift credit',
        body: 'Continue to payment to send gift credit. They can spend it in the store or toward a Hanukkah box after claiming.',
        ctaLabel: 'Continue to payment',
      };
    case 'gift_customize_incomplete':
      return {
        headline: 'Finish your gift box',
        body: 'Keep customizing, then pay — they’ll claim the gift by email.',
        ctaLabel: 'Continue customizing',
      };
    case 'gift_sent':
      return {
        headline: 'Send another gift',
        body: 'Or build a Hanukkah box for your own household whenever you’re ready.',
        ctaLabel: 'Send another gift',
      };
    case 'locked':
      return {
        headline: 'Passover 2027 is coming',
        body: 'Your Hanukkah box is locked and on its way. Explore early interest for Passover 2027 — dates and offers coming soon.',
        ctaLabel: 'Explore Passover 2027',
        backgroundSource: PASSOVER_STRIP_BG,
      };
    case 'passover':
      return {
        headline: 'Passover 2027 is coming',
        body: 'Hanukkah 2026 is complete. Explore early interest for Passover 2027 — dates and offers coming soon.',
        ctaLabel: 'Explore Passover 2027',
        backgroundSource: PASSOVER_STRIP_BG,
      };
    default:
      return null;
  }
}
