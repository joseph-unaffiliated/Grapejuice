import type { Appearance, CssFontSource } from '@stripe/stripe-js';
import { WEB_FONT_FAMILY, borderRadius, semanticColors } from '../../../constants/theme';

/** Stripe's card form runs in an iframe, so the Account input style is passed in here. */
export const STRIPE_APPEARANCE: Appearance = {
  theme: 'stripe',
  variables: {
    fontFamily: `"${WEB_FONT_FAMILY}", system-ui, sans-serif`,
    fontSizeBase: '14px',
    borderRadius: `${borderRadius.xl}px`,
    colorPrimary: semanticColors.goldMuted,
    colorText: semanticColors.textPrimary,
    colorTextSecondary: semanticColors.textSecondary,
    colorTextPlaceholder: semanticColors.textTertiary,
    colorDanger: semanticColors.error,
  },
  rules: {
    '.Input': { border: `1px solid ${semanticColors.brand}`, boxShadow: 'none' },
    '.Input:focus': { borderColor: semanticColors.goldMuted, boxShadow: 'none' },
    '.Tab': { border: `1px solid ${semanticColors.brand}`, boxShadow: 'none' },
    '.Tab--selected': { borderColor: semanticColors.goldMuted, boxShadow: 'none' },
    '.Label': { fontSize: '12px', color: semanticColors.textSecondary },
  },
};

export const STRIPE_FONTS: CssFontSource[] = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap' },
];
