/**
 * Editorial lifestyle / video slots for the storefront experiment.
 * `src` is a remote URL, a bundled require(), or null (labeled placeholder).
 * Later: Airtable SoT can replace this module with live URLs.
 */

import type { ImageSourcePropType } from 'react-native';

export type StorefrontMediaKind = 'image' | 'video';

export type StorefrontMediaSlot = {
  id: string;
  kind: StorefrontMediaKind;
  /** CSS-ish aspect ratio string for layout hints, e.g. '16/9' or '4/5'. */
  aspect: string;
  label: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  /** Category slug, product slug, or special: 'box' | 'rav' | 'look'. */
  href?: string;
  /** Remote URL, bundled image (`require(...)`), or null for placeholder. */
  src: string | ImageSourcePropType | null;
};

/** Native aspect of `hero-menorahs-trio-ultrawide.png` (ultrawide lifestyle). */
export const STOREFRONT_HERO_ASPECT = 3200 / 915;

export const STOREFRONT_HERO: StorefrontMediaSlot = {
  id: 'hero-table',
  kind: 'image',
  aspect: '32/9',
  label: 'Lifestyle — Hanukkah table',
  headline: 'Light the season',
  body: 'Menorahs, dreidels, and table pieces for nights that feel like home.',
  ctaLabel: 'Browse menorahs',
  href: 'menorahs',
  src: require('../../assets/storefront/hero-menorahs-trio-ultrawide.webp'),
};

export const STOREFRONT_EDITORIAL: StorefrontMediaSlot[] = [
  {
    id: 'editorial-table-video',
    kind: 'image',
    aspect: '16/9',
    label: 'Lifestyle — Kitchen food',
    headline: 'Set the table for eight nights',
    body: 'A short look at how a Grapejuice table comes together.',
    ctaLabel: 'Shop Decor',
    href: 'decor',
    src: require('../../assets/storefront/editorial-setting-table.webp'),
  },
  {
    id: 'editorial-gifts',
    kind: 'image',
    aspect: '3/2',
    label: 'Lifestyle — Kids toys',
    headline: 'Toys for little hands',
    body: 'Stuffies, a clay dreidel, a wood play menorah, and a story.',
    ctaLabel: 'Shop Gifts',
    href: 'gifts',
    src: require('../../assets/storefront/editorial-gift-stack.webp'),
  },
];
