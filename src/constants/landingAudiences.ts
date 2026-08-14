import type { ImageSourcePropType } from 'react-native';
import type { GiftPath } from '../screens/gift/giftGiveTypes';
import type { CatalogItem } from '../types/pilot';
import type { StorefrontMediaSlot } from './storefrontMedia';
import { filterByStorefrontCategory } from './storefrontCategories';

/** Audience ids for modular campaign landings (code-config v1). */
export type LandingAudienceId =
  | 'gift'
  | 'default'
  | 'cultural'
  | 'interfaith'
  | 'convenience'
  | 'last_minute'
  | 'for_your_home';

export type LandingCtaAction =
  | { type: 'gift_give'; giftPath: GiftPath }
  | { type: 'start_box' }
  | { type: 'store' }
  | { type: 'store_category'; category: string };

export type LandingCtaStyle = 'primary' | 'secondary' | 'secondaryLight' | 'escape';

export type LandingCta = {
  label: string;
  action: LandingCtaAction;
  style?: LandingCtaStyle;
};

/**
 * Modular landing blocks — renderer only draws what's listed.
 * Phase 1: code-config. Phase 2 CMS can persist the same shape.
 */
export type LandingSection =
  | { type: 'hero'; slot: StorefrontMediaSlot; ctas: LandingCta[] }
  | {
      type: 'story';
      heading: string;
      body: string;
      image: ImageSourcePropType;
      cta?: LandingCta;
    }
  | {
      type: 'categories';
      heading?: string;
      body?: string;
      cards?: LandingCategoryCardDef[];
    }
  | {
      type: 'products';
      heading: string;
      body?: string;
      /** Storefront aisle slug (`toys`, `books`, …) — same filters as /store. */
      category?: string;
      /** Optional curated ids; when present and resolvable, wins over category. */
      productIds?: string[];
      /** Max items to show (default 6). */
      limit?: number;
    }
  | { type: 'cta_row'; ctas: LandingCta[] }
  | {
      type: 'ask_rav';
      eyebrow?: string;
      headline?: string;
      body?: string;
      placeholder?: string;
      /**
       * Rotating SearchPill prompts.
       * - omit → homepage defaults
       * - [] → disable autoplay
       * - string[] → custom prompts
       */
      prompts?: string[];
    };

/** Tall photo card → filtered category PLP. */
export type LandingCategoryCardDef = {
  label: string;
  category: string;
  image: ImageSourcePropType;
};

export type LandingAudienceConfig = {
  id: string;
  /** Canonical browser path, e.g. `/gift`. */
  path: string;
  /** Legacy paths that still resolve to this audience (canonicalize to `path`). */
  legacyPaths?: string[];
  /** Short footer / nav label. */
  navLabel: string;
  /** UTM campaign values that map to this audience. */
  utmCampaigns: string[];
  chrome: 'minimal' | 'storefront';
  primarySuccess: 'gift_start' | 'start_box';
  /** Ordered modular page composition. */
  sections: LandingSection[];
};

const GIFT_HERO_SRC: ImageSourcePropType = require('../../assets/storefront/editorial-gift-stack.webp');
const CULTURAL_HERO_SRC: ImageSourcePropType = require('../../assets/storefront/familysplash2.webp');
const INTERFAITH_HERO_SRC: ImageSourcePropType = require('../../assets/storefront/setthetablev1.webp');
const STORY_IMG_A: ImageSourcePropType = require('../../assets/storefront/familysplash2.webp');
const STORY_IMG_B: ImageSourcePropType = require('../../assets/storefront/setthetablev1.webp');
const STORY_IMG_GIFT: ImageSourcePropType = require('../../assets/storefront/editorial-gift-stack.webp');

/** Shared aisle tiles for landings (override per audience when needed). */
export const DEFAULT_LANDING_CATEGORY_CARDS: LandingCategoryCardDef[] = [
  {
    label: 'Menorahs',
    category: 'menorahs',
    image: require('../../assets/storefront/hero-menorahs-trio.png'),
  },
  {
    label: 'Stuffies',
    category: 'stuffies',
    image: require('../../assets/catalog/plush-dreidel.png'),
  },
  {
    label: 'Food',
    category: 'food',
    image: require('../../assets/storefront/editorial-setting-table.jpg'),
  },
  {
    label: 'Dreidels',
    category: 'dreidels',
    image: require('../../assets/catalog/english-hebrew-dreidel.png'),
  },
];

type BuildSectionsInput = {
  hero: StorefrontMediaSlot;
  heroCtas: LandingCta[];
  offer: { heading: string; body: string; image: ImageSourcePropType };
  proof: { heading: string; body: string; image: ImageSourcePropType };
  /** Omit to hide aisle rail. */
  categories?: boolean | { heading?: string; body?: string; cards?: LandingCategoryCardDef[] };
  /** Omit to hide product grid. */
  products?: {
    heading: string;
    body?: string;
    category?: string;
    productIds?: string[];
    limit?: number;
  };
  footerCtas: LandingCta[];
};

/** Helper to compose the common landing rhythm without hardcoding layout in the screen. */
export function buildLandingSections(input: BuildSectionsInput): LandingSection[] {
  const sections: LandingSection[] = [
    { type: 'hero', slot: input.hero, ctas: input.heroCtas },
    {
      type: 'story',
      heading: input.offer.heading,
      body: input.offer.body,
      image: input.offer.image,
    },
  ];
  if (input.categories) {
    const cat = input.categories === true ? {} : input.categories;
    sections.push({
      type: 'categories',
      heading: cat.heading ?? 'Shop by aisle',
      body: cat.body ?? 'Tall looks into the collection — tap through to browse that filter.',
      cards: cat.cards,
    });
  }
  sections.push({
    type: 'story',
    heading: input.proof.heading,
    body: input.proof.body,
    image: input.proof.image,
  });
  if (input.products) {
    sections.push({ type: 'products', ...input.products });
  }
  if (input.footerCtas.length) {
    sections.push({ type: 'cta_row', ctas: input.footerCtas });
  }
  return sections;
}

/** Short labels for admin “what’s on this page” hints. */
export function landingSectionSummary(config: LandingAudienceConfig): string {
  const labels = config.sections.map((s) => {
    switch (s.type) {
      case 'hero':
        return 'hero';
      case 'story':
        return 'story';
      case 'categories':
        return 'aisles';
      case 'products':
        return 'products';
      case 'cta_row':
        return 'ctas';
      default:
        return '?';
    }
  });
  return labels.join(' · ');
}

/** Gift / grandparent campaign — no aisle rail or product grid; gift CTAs + box escape. */
export const GIFT_LANDING: LandingAudienceConfig = {
  id: 'gift',
  path: '/gift',
  navLabel: 'Giving a gift',
  utmCampaigns: ['gift', 'gp-gift', 'grandparent-gift', 'give-hanukkah'],
  chrome: 'minimal',
  primarySuccess: 'gift_start',
  sections: buildLandingSections({
    hero: {
      id: 'landing-gift-hero',
      kind: 'image',
      aspect: '3/2',
      label: 'Lifestyle — Gift stack',
      headline: 'Give a Hanukkah they’ll actually celebrate',
      body: 'A curated box for the kids you love — personalize it yourself, or send a gift card so their family can. Free shipping; you won’t be charged until it ships.',
      ctaLabel: 'Pick items for them',
      href: 'gift',
      src: GIFT_HERO_SRC,
    },
    heroCtas: [
      {
        label: 'Pick items for them',
        action: { type: 'gift_give', giftPath: 'customize' },
        style: 'primary',
      },
      {
        label: 'Let them choose',
        action: { type: 'gift_give', giftPath: 'credit_only' },
        style: 'secondary',
      },
    ],
    offer: {
      heading: 'One box, two ways to give',
      body: 'Same curated Hanukkah box either way. You pick the pieces, or send a gift card and let their parents finish.',
      image: STORY_IMG_GIFT,
    },
    proof: {
      heading: 'Made for givers',
      body: 'For grandparents and family who want Hanukkah to feel doable — not another homework assignment.',
      image: STORY_IMG_A,
    },
    // No categories / products — gift path stays editorial + CTAs.
    footerCtas: [
      { label: 'Build your box', action: { type: 'start_box' }, style: 'secondaryLight' },
      {
        label: 'Browse the Collection',
        action: { type: 'store_category', category: 'collection' },
        style: 'escape',
      },
    ],
  }),
};

/**
 * Culturally Jewish / non-practicing — “the 70%”.
 * Public path `/your-way` (less institutional than “unaffiliated” / “secular”).
 */
export const CULTURAL_LANDING: LandingAudienceConfig = {
  id: 'cultural',
  path: '/your-way',
  legacyPaths: ['/unaffiliated'],
  navLabel: 'Jewish, your way',
  utmCampaigns: [
    'your-way',
    'cultural',
    'unaffiliated',
    'secular',
    'cultural-jewish',
    'the-70',
    '70-percent',
  ],
  chrome: 'minimal',
  primarySuccess: 'start_box',
  sections: buildLandingSections({
    hero: {
      id: 'landing-cultural-hero',
      kind: 'image',
      aspect: '4082/1536',
      label: 'Lifestyle — Family Hanukkah',
      headline: 'Hanukkah without the homework',
      body: 'A curated box for culturally Jewish families who want the glow of the holiday — not a syllabus. No assumed knowledge. Just eight nights that feel doable.',
      ctaLabel: 'Build your box',
      href: 'box',
      src: CULTURAL_HERO_SRC,
    },
    heroCtas: [
      { label: 'Build your box', action: { type: 'start_box' }, style: 'primary' },
      {
        label: 'Browse the Collection',
        action: { type: 'store_category', category: 'collection' },
        style: 'secondary',
      },
    ],
    offer: {
      heading: 'One box. Eight nights. Sorted.',
      body: 'Menorah moments, food, stories, and kid-friendly pieces — curated for your household, then easy to customize before it ships.',
      image: STORY_IMG_A,
    },
    proof: {
      heading: 'Made for how you actually live',
      body: 'For families who light candles when they can, know some of the songs, and care more about connection than curriculum.',
      image: STORY_IMG_B,
    },
    categories: true,
    products: {
      heading: 'The easy table',
      body: 'Warm, low-lift pieces that make the nights feel like something — without a lesson plan.',
      productIds: [
        'family-hanukkiah-keepsake',
        'keepsake-dreidel',
        'display-runner-cloth',
        'hanukkah-blanket',
        'english-hebrew-dreidel',
        'cocktail-napkins-party',
      ],
    },
    footerCtas: [
      {
        label: 'Give as a gift',
        action: { type: 'gift_give', giftPath: 'customize' },
        style: 'secondaryLight',
      },
      { label: 'Explore the store', action: { type: 'store' }, style: 'escape' },
    ],
  }),
};

/**
 * Interfaith / two-tradition homes — Hanukkah alongside another calendar.
 */
export const INTERFAITH_LANDING: LandingAudienceConfig = {
  id: 'interfaith',
  path: '/interfaith',
  navLabel: 'Interfaith homes',
  utmCampaigns: ['interfaith', 'two-traditions', 'mixed-faith', 'both'],
  chrome: 'minimal',
  primarySuccess: 'start_box',
  sections: buildLandingSections({
    hero: {
      id: 'landing-interfaith-hero',
      kind: 'image',
      aspect: '1536/1024',
      label: 'Lifestyle — Shared table',
      headline: 'Hanukkah in a two-tradition home',
      body: 'When one parent grew up Jewish and the other didn’t — or you celebrate more than one December — here’s a warm, low-pressure way to make the menorah nights feel like yours.',
      ctaLabel: 'Build your box',
      href: 'box',
      src: INTERFAITH_HERO_SRC,
    },
    heroCtas: [
      { label: 'Build your box', action: { type: 'start_box' }, style: 'primary' },
      {
        label: 'Browse the Collection',
        action: { type: 'store_category', category: 'collection' },
        style: 'secondary',
      },
    ],
    offer: {
      heading: 'Share the calendar, keep the glow',
      body: 'Eight nights that can sit next to Christmas trees, school concerts, and travel. Customize what fits your house; skip what doesn’t.',
      image: STORY_IMG_B,
    },
    proof: {
      heading: 'Room for both',
      body: 'No quiz on who “counts.” Just a box that helps the Jewish side of the family show up with light, food, and kid-friendly moments — alongside whatever else you already do.',
      image: STORY_IMG_A,
    },
    categories: true,
    products: {
      heading: 'Shared-table starters',
      body: 'Welcoming pieces that don’t assume everyone already knows the songs.',
      productIds: [
        'family-hanukkiah-keepsake',
        'english-hebrew-dreidel',
        'hanukkah-banner-garland',
        'cocktail-napkins-party',
        'child-hanukkiah-electric',
        'display-runner-cloth',
      ],
    },
    footerCtas: [
      {
        label: 'Give as a gift',
        action: { type: 'gift_give', giftPath: 'customize' },
        style: 'secondaryLight',
      },
      { label: 'Explore the store', action: { type: 'store' }, style: 'escape' },
    ],
  }),
};

/**
 * Convenience — practicing / busy households who want the kit without the hunt.
 * Path `/convenience`.
 */
export const CONVENIENCE_LANDING: LandingAudienceConfig = {
  id: 'convenience',
  path: '/convenience',
  navLabel: 'Easy delivery',
  utmCampaigns: ['convenience', 'easy', 'to-your-door', 'practicing-convenience'],
  chrome: 'minimal',
  primarySuccess: 'start_box',
  sections: buildLandingSections({
    hero: {
      id: 'landing-convenience-hero',
      kind: 'image',
      aspect: '4082/1536',
      label: 'Lifestyle — Delivered table',
      headline: 'Everything you need to live, straight to your door',
      body: 'Candles, food, stories, and the pieces that make eight nights happen — curated once, shipped before you need them. Free shipping; you won’t be charged until it ships.',
      ctaLabel: 'Build your box',
      href: 'box',
      src: CULTURAL_HERO_SRC,
    },
    heroCtas: [
      { label: 'Build your box', action: { type: 'start_box' }, style: 'primary' },
      {
        label: 'Browse the Collection',
        action: { type: 'store_category', category: 'collection' },
        style: 'secondary',
      },
    ],
    offer: {
      heading: 'The kit, not the scavenger hunt',
      body: 'Skip the last-minute drugstore run. Customize what you want; leave the rest to us.',
      image: STORY_IMG_A,
    },
    proof: {
      heading: 'One less thing to remember',
      body: 'For households who already know the rhythm — and just want the box to show up ready.',
      image: STORY_IMG_B,
    },
    categories: true,
    products: {
      heading: 'Low-friction staples',
      body: 'The pieces that make the nights run without another errand.',
      productIds: [
        'candles-44-pack',
        'latke-mix',
        'sufganiyot-kit',
        'family-hanukkiah-keepsake',
        'display-runner-cloth',
        'gelt-standard',
      ],
    },
    footerCtas: [
      {
        label: 'Give as a gift',
        action: { type: 'gift_give', giftPath: 'customize' },
        style: 'secondaryLight',
      },
      { label: 'Explore the store', action: { type: 'store' }, style: 'escape' },
    ],
  }),
};

/**
 * Last-minute / never caught off guard — seasonal urgency.
 * Path `/last-minute`.
 */
export const LAST_MINUTE_LANDING: LandingAudienceConfig = {
  id: 'last_minute',
  path: '/last-minute',
  navLabel: 'Last-minute ready',
  utmCampaigns: ['last-minute', 'lastminute', 'scramble', 'forgot', 'caught-off-guard'],
  chrome: 'minimal',
  primarySuccess: 'start_box',
  sections: buildLandingSections({
    hero: {
      id: 'landing-last-minute-hero',
      kind: 'image',
      aspect: '3/2',
      label: 'Lifestyle — Ready nights',
      headline: 'Never get caught off guard again',
      body: 'Forgot the date? Still time to make the nights feel like something. A curated box ships to your door — candles, gelt, and kid-friendly pieces included.',
      ctaLabel: 'Build your box',
      href: 'box',
      src: GIFT_HERO_SRC,
    },
    heroCtas: [
      { label: 'Build your box', action: { type: 'start_box' }, style: 'primary' },
      {
        label: 'Browse the Collection',
        action: { type: 'store_category', category: 'collection' },
        style: 'secondary',
      },
    ],
    offer: {
      heading: 'Ready-to-go nights',
      body: 'Staples first, swaps later. Get the box moving, then refine before it ships.',
      image: STORY_IMG_GIFT,
    },
    proof: {
      heading: 'Scramble less. Celebrate more.',
      body: 'Built for the year you realize Hanukkah starts… tomorrow. We handle the list.',
      image: STORY_IMG_A,
    },
    categories: true,
    products: {
      heading: 'Grab-and-go staples',
      body: 'The minimum viable menorah week — then add what you love.',
      productIds: [
        'candles-44-pack',
        'gelt-standard',
        'keepsake-dreidel',
        'board-book-hanukkah',
        'family-hanukkiah-keepsake',
        'plush-dreidel',
      ],
    },
    footerCtas: [
      {
        label: 'Give as a gift',
        action: { type: 'gift_give', giftPath: 'customize' },
        style: 'secondaryLight',
      },
      { label: 'Explore the store', action: { type: 'store' }, style: 'escape' },
    ],
  }),
};

/**
 * Aesthetic / for your home — pieces that fit the house (includes parenting-aesthetic kids goods).
 * Path `/for-your-home`.
 */
export const FOR_YOUR_HOME_LANDING: LandingAudienceConfig = {
  id: 'for_your_home',
  path: '/for-your-home',
  navLabel: 'For your home',
  utmCampaigns: ['for-your-home', 'aesthetic', 'home', 'design', 'look'],
  chrome: 'minimal',
  primarySuccess: 'start_box',
  sections: buildLandingSections({
    hero: {
      id: 'landing-for-your-home-hero',
      kind: 'image',
      aspect: '1536/1024',
      label: 'Lifestyle — Home aesthetic',
      headline: 'Hanukkah that looks like your house',
      body: 'Quality, unique pieces that feel right on the mantel and around the house — from the table to the kids’ corner. Chosen to sit comfortably with the rest of your home.',
      ctaLabel: 'Browse the Collection',
      href: 'collection',
      src: INTERFAITH_HERO_SRC,
    },
    heroCtas: [
      {
        label: 'Browse the Collection',
        action: { type: 'store_category', category: 'collection' },
        style: 'primary',
      },
      { label: 'Build your box', action: { type: 'start_box' }, style: 'secondary' },
    ],
    offer: {
      heading: 'Form meets eight nights',
      body: 'Keepsake menorahs, soft goods, and kid pieces that feel considered — then customize the rest of the box.',
      image: STORY_IMG_B,
    },
    proof: {
      heading: 'Made for the mantel',
      body: 'Keepsakes and soft goods that look at home while they’re out — including kid pieces that feel as intentional as everything else.',
      image: STORY_IMG_A,
    },
    categories: true,
    products: {
      heading: 'Home-forward picks',
      body: 'Statement and soft goods — plus beautiful kids pieces folded in.',
      productIds: [
        'family-hanukkiah-keepsake',
        'hanukkah-blanket',
        'display-runner-cloth',
        'hanukkah-banner-garland',
        'plush-dreidel',
        'pyjamas-hanukkah',
      ],
    },
    footerCtas: [
      {
        label: 'Give as a gift',
        action: { type: 'gift_give', giftPath: 'customize' },
        style: 'secondaryLight',
      },
      { label: 'Explore the store', action: { type: 'store' }, style: 'escape' },
    ],
  }),
};

/**
 * Resolve products for a landing grid.
 * Priority: curated ids (when they resolve) → storefront category filter → most-loved.
 */
export function resolveLandingProducts(
  catalog: CatalogItem[],
  opts: {
    productIds?: string[];
    category?: string;
    limit?: number;
  } = {},
  fallbackLimit = 6
): CatalogItem[] {
  if (!catalog.length) return [];
  const limit = Math.max(1, opts.limit ?? fallbackLimit);

  const productIds = opts.productIds ?? [];
  if (productIds.length) {
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const curated = productIds
      .map((id) => byId.get(id))
      .filter((item): item is CatalogItem => item != null);
    if (curated.length) return curated.slice(0, Math.max(limit, curated.length));
  }

  if (opts.category) {
    const filtered = filterByStorefrontCategory(catalog, opts.category).sort((a, b) => {
      const ar = a.storefrontRank ?? Number.POSITIVE_INFINITY;
      const br = b.storefrontRank ?? Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
    if (filtered.length) return filtered.slice(0, limit);
  }

  const loved = catalog
    .filter((item) => item.storefrontRails?.includes('most-loved'))
    .sort((a, b) => {
      const ar = a.storefrontRank ?? Number.POSITIVE_INFINITY;
      const br = b.storefrontRank ?? Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
  const source = loved.length ? loved : catalog;
  return source.slice(0, limit);
}

export const LANDING_AUDIENCES: Partial<Record<LandingAudienceId, LandingAudienceConfig>> = {
  gift: GIFT_LANDING,
  cultural: CULTURAL_LANDING,
  interfaith: INTERFAITH_LANDING,
  convenience: CONVENIENCE_LANDING,
  last_minute: LAST_MINUTE_LANDING,
  for_your_home: FOR_YOUR_HOME_LANDING,
};

/** Ordered list of campaign landings (footer, admin, registry). */
export const LANDING_REGISTRY: LandingAudienceConfig[] = [
  CULTURAL_LANDING,
  GIFT_LANDING,
  INTERFAITH_LANDING,
  CONVENIENCE_LANDING,
  LAST_MINUTE_LANDING,
  FOR_YOUR_HOME_LANDING,
];

/** Footer “Who its for” rows — organic discovery of campaign landings. */
export const FOOTER_WHO_ITS_FOR: LandingAudienceConfig[] = LANDING_REGISTRY;

/** MainStack screen name for a campaign landing audience. */
export type LandingScreenName = 'GiftLanding' | 'DynamicLanding';

export function landingScreenForAudience(id: string): LandingScreenName | null {
  if (!id) return null;
  if (id === 'gift') return 'GiftLanding';
  return 'DynamicLanding';
}

/** Admin “Test landings” / entry preview rows (inbound / ad entry points). */
export type EntryLandingPreviewOption = {
  id: string;
  label: string;
  description: string;
  /** null = default storefront (clear entry / exit mock). */
  audienceId: string | null;
  /** MainStack screen to open. */
  screen: LandingScreenName | 'StorefrontHome';
  /** When false, row is shown but not navigable yet. */
  ready: boolean;
};

export function buildEntryLandingPreviewOptions(
  landings: LandingAudienceConfig[] = LANDING_REGISTRY
): EntryLandingPreviewOption[] {
  return [
    {
      id: 'default',
      label: 'Default store',
      description: 'Organic /store — exit mock entry',
      audienceId: null,
      screen: 'StorefrontHome',
      ready: true,
    },
    ...landings.map((audience) => ({
      id: audience.id,
      label: audience.navLabel,
      description: `${audience.path} — ${landingSectionSummary(audience)}`,
      audienceId: audience.id,
      screen: landingScreenForAudience(audience.id)!,
      ready: true,
    })),
  ];
}

/** @deprecated Prefer buildEntryLandingPreviewOptions(merged) for CMS pages. */
export const ENTRY_LANDING_PREVIEW_OPTIONS: EntryLandingPreviewOption[] =
  buildEntryLandingPreviewOptions();

export function landingAudienceById(id: string | null | undefined): LandingAudienceConfig | null {
  if (!id) return null;
  // Session storage may still hold the pre-rename id.
  if (id === 'unaffiliated') return CULTURAL_LANDING;
  return LANDING_AUDIENCES[id as LandingAudienceId] ?? null;
}

export function landingAudienceFromPath(pathname: string): LandingAudienceConfig | null {
  const path = pathname.replace(/\/$/, '') || '/';
  for (const audience of Object.values(LANDING_AUDIENCES)) {
    if (!audience) continue;
    if (audience.path === path) return audience;
    if (audience.legacyPaths?.includes(path)) return audience;
  }
  return null;
}

export function landingAudienceFromUtmCampaign(campaign: string | null | undefined): LandingAudienceConfig | null {
  if (!campaign) return null;
  const key = campaign.trim().toLowerCase();
  if (!key) return null;
  for (const audience of Object.values(LANDING_AUDIENCES)) {
    if (audience?.utmCampaigns.includes(key)) return audience;
  }
  return null;
}
