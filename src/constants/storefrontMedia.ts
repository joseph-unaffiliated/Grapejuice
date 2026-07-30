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
  /** Optional second line under `body` (e.g. hero date callout). */
  bodySecondary?: string;
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
  headline: 'Hanukkah Made Easy',
  body: 'Everything you need, delivered straight to your home',
  bodySecondary: 'Hanukkah starts sundown Dec. 4th, 2026',
  ctaLabel: 'Browse the Collection',
  href: 'collection',
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
    ctaLabel: 'Shop Gifts',
    href: 'gifts',
    src: require('../../assets/storefront/editorial-setting-table.webp'),
  },
  {
    id: 'editorial-gifts',
    kind: 'image',
    aspect: '3/2',
    label: 'Lifestyle — Kids toys',
    headline: 'Toys for little hands',
    body: 'Stuffies, a clay dreidel, a wood play menorah, and a story. Can come pre-wrapped in Hanukkah themed paper when ordered with a box.',
    ctaLabel: 'Shop Gifts',
    href: 'gifts',
    src: require('../../assets/storefront/editorial-gift-stack.webp'),
  },
];
