/**
 * Titles, descriptions and indexing rules shared by the in-app `useSeoMeta` hook and
 * `scripts/build-seo.mjs` (static per-route HTML). Keep this file free of React Native
 * imports: the build script loads it in plain Node.
 */
import { STOREFRONT_CATEGORIES } from './storefrontCategories';
import { OUR_STORY_COPY } from './storefrontOurStoryCopy';
import { LANDING_AUDIENCES } from './landingAudiences';

export const SITE_ORIGIN = 'https://grapejuice.co';
export const SITE_NAME = 'Grapejuice';
export const HOME_TITLE = 'Grapejuice | Hanukkah made easy';
export const DEFAULT_SEO_DESCRIPTION =
  'Curated Hanukkah boxes for culturally Jewish families: candles, gelt, dreidels, latke and sufganiyot mixes, and a book and a present for each kid, delivered free. Boxes start at $80.';

/** Signed-in, transactional or per-device paths: never indexed (also disallowed in robots.txt). */
export const PRIVATE_PATH_PREFIXES: readonly string[] = [
  '/checkout',
  '/box',
  '/my-box',
  '/account',
  '/admin',
  '/orders',
  '/my-gifts',
  '/login',
  '/gift/give',
  '/gift/customize',
  '/gift/claim',
  '/auth',
  '/reset-password',
  '/__',
  '/store/favorites',
];

export function isPrivatePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PRIVATE_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Same shape as the navigator's document title: "Grapejuice | Page". */
export function seoTitle(page?: string | null): string {
  const p = page?.trim();
  if (!p || p === SITE_NAME) return HOME_TITLE;
  return `${SITE_NAME} | ${p}`;
}

export function canonicalUrl(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

/** Trim to a search-snippet length on a word boundary. */
export function clampDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).replace(/[,.;:]$/, '')}…`;
}

export type StaticSeo = { title: string; description: string };

export const GIFT_SEO_DESCRIPTION =
  'Send a curated Hanukkah box to the kids you love, or gift credit so their family can build their own. Free shipping, and it arrives before Hanukkah.';

export const LEGAL_SEO: Record<'/terms' | '/privacy', StaticSeo> = {
  '/terms': {
    title: seoTitle('Terms of Use and Sale'),
    description: 'The terms for using Grapejuice and buying Hanukkah boxes and products from us.',
  },
  '/privacy': {
    title: seoTitle('Privacy Policy'),
    description: 'How Grapejuice and the Unaffiliated network collect, use and protect your information.',
  },
};

/** Title + description for a public path we know without catalog data; null for products / unknown. */
export function staticSeoForPath(pathname: string): StaticSeo | null {
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  if (path === '/' || path === '/store' || path === '/home') {
    return { title: HOME_TITLE, description: DEFAULT_SEO_DESCRIPTION };
  }
  const store = path.match(/^\/store\/([a-z0-9-]+)$/);
  if (store) {
    const cat = STOREFRONT_CATEGORIES.find((c) => c.slug === store[1]);
    if (!cat) return null;
    return {
      title: seoTitle(cat.title),
      description: clampDescription(`${cat.description} Shop Hanukkah ${cat.label.toLowerCase()} at Grapejuice.`),
    };
  }
  if (path === '/story') {
    return { title: seoTitle('Our Story'), description: clampDescription(OUR_STORY_COPY.lead) };
  }
  if (path === '/terms' || path === '/privacy') return LEGAL_SEO[path];
  if (path === '/gift') {
    return { title: seoTitle('Give a Hanukkah gift'), description: GIFT_SEO_DESCRIPTION };
  }
  const landing = Object.values(LANDING_AUDIENCES).find((l) => l.path === path);
  if (landing) {
    const hero = landing.sections.find((s) => s.type === 'hero');
    const headline = hero && hero.type === 'hero' ? hero.slot.headline : undefined;
    const body = hero && hero.type === 'hero' ? hero.slot.body : undefined;
    return {
      title: seoTitle(headline?.replace(/\s+/g, ' ') || landing.navLabel),
      description: clampDescription(body || DEFAULT_SEO_DESCRIPTION),
    };
  }
  return null;
}
