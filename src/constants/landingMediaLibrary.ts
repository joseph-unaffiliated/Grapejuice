import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled images pickable in the marketing-landing CMS.
 * Firestore stores `imageKey`; runtime resolves via this map.
 */
export type LandingMediaEntry = {
  key: string;
  label: string;
  source: ImageSourcePropType;
};

export const LANDING_MEDIA_LIBRARY: LandingMediaEntry[] = [
  {
    key: 'familysplash2',
    label: 'Family splash',
    source: require('../../assets/storefront/familysplash2.webp'),
  },
  {
    key: 'setthetablev1',
    label: 'Set the table',
    source: require('../../assets/storefront/setthetablev1.webp'),
  },
  {
    key: 'editorial-gift-stack',
    label: 'Gift stack',
    source: require('../../assets/storefront/editorial-gift-stack.webp'),
  },
  {
    key: 'editorial-setting-table',
    label: 'Kitchen latkes / sufganiyot',
    source: require('../../assets/storefront/editorial-setting-table.jpg'),
  },
  {
    key: 'hero-menorahs-trio',
    label: 'Menorahs trio',
    source: require('../../assets/storefront/hero-menorahs-trio.png'),
  },
  {
    key: 'plush-dreidel',
    label: 'Plush dreidel',
    source: require('../../assets/catalog/plush-dreidel.png'),
  },
  {
    key: 'english-hebrew-dreidel',
    label: 'Wooden dreidels',
    source: require('../../assets/catalog/english-hebrew-dreidel.png'),
  },
  {
    key: 'family-hanukkiah-keepsake',
    label: 'Family hanukkiah (catalog)',
    source: require('../../assets/catalog/family-hanukkiah-keepsake.png'),
  },
  {
    key: 'keepsake-dreidel',
    label: 'Keepsake / figurines',
    source: require('../../assets/catalog/keepsake-dreidel.png'),
  },
];

const BY_KEY = new Map(LANDING_MEDIA_LIBRARY.map((e) => [e.key, e]));

export function landingMediaSource(key: string | null | undefined): ImageSourcePropType {
  if (key && BY_KEY.has(key)) return BY_KEY.get(key)!.source;
  return LANDING_MEDIA_LIBRARY[0].source;
}

export function landingMediaKeyForSource(source: ImageSourcePropType): string {
  for (const entry of LANDING_MEDIA_LIBRARY) {
    if (entry.source === source) return entry.key;
  }
  return LANDING_MEDIA_LIBRARY[0].key;
}

export function landingMediaLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}
