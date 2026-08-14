import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type {
  LandingAudienceConfig,
  LandingAudienceId,
  LandingCta,
  LandingCtaAction,
  LandingCtaStyle,
  LandingSection,
} from '../../constants/landingAudiences';
import {
  landingMediaKeyForSource,
  landingMediaSource,
} from '../../constants/landingMediaLibrary';
import type { StorefrontMediaSlot } from '../../constants/storefrontMedia';

/** Firestore path: `landings/{audienceId}` */
export const LANDINGS_COLLECTION = 'landings';

export type StoredMediaSlot = Omit<StorefrontMediaSlot, 'src'> & { imageKey: string };

export type StoredCategoryCard = {
  label: string;
  category: string;
  imageKey: string;
};

export type StoredLandingSection =
  | { type: 'hero'; slot: StoredMediaSlot; ctas: LandingCta[] }
  | {
      type: 'story';
      heading: string;
      body: string;
      imageKey: string;
      cta?: LandingCta;
    }
  | {
      type: 'categories';
      heading?: string;
      body?: string;
      cards?: StoredCategoryCard[];
    }
  | {
      type: 'products';
      heading: string;
      body?: string;
      productIds: string[];
    }
  | { type: 'cta_row'; ctas: LandingCta[] }
  | {
      type: 'ask_rav';
      eyebrow?: string;
      headline?: string;
      body?: string;
      placeholder?: string;
      /** Empty array disables typewriter autoplay. */
      prompts?: string[];
    };

/** Serializable landing doc stored in Firestore. */
export type StoredLandingDoc = {
  id: string;
  path: string;
  legacyPaths?: string[];
  navLabel: string;
  utmCampaigns: string[];
  chrome: 'minimal' | 'storefront';
  primarySuccess: 'gift_start' | 'start_box';
  sections: StoredLandingSection[];
  updatedAt?: string;
};

function landingsCollection() {
  if (!db) return null;
  return collection(db, LANDINGS_COLLECTION);
}

function landingDocRef(id: string) {
  if (!db) return null;
  return doc(db, LANDINGS_COLLECTION, id);
}

/** Firestore rejects `undefined` anywhere in the payload. */
function omitUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitUndefinedDeep);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[key] = omitUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

function asCta(raw: unknown): LandingCta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const label = String(o.label ?? '').trim();
  if (!label) return null;
  const actionRaw = o.action;
  if (!actionRaw || typeof actionRaw !== 'object') return null;
  const a = actionRaw as Record<string, unknown>;
  const type = String(a.type ?? '');
  let action: LandingCtaAction | null = null;
  if (type === 'start_box') action = { type: 'start_box' };
  else if (type === 'store') action = { type: 'store' };
  else if (type === 'store_category') {
    action = { type: 'store_category', category: String(a.category ?? 'collection') };
  } else if (type === 'gift_give') {
    const giftPath = a.giftPath === 'credit_only' ? 'credit_only' : 'customize';
    action = { type: 'gift_give', giftPath };
  }
  if (!action) return null;
  const style = o.style as LandingCtaStyle | undefined;
  return style ? { label, action, style } : { label, action };
}

function asCtas(raw: unknown): LandingCta[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(asCta).filter((c): c is LandingCta => c != null);
}

function parseStoredSection(raw: unknown): StoredLandingSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? '');
  switch (type) {
    case 'hero': {
      const slotRaw = o.slot;
      if (!slotRaw || typeof slotRaw !== 'object') return null;
      const s = slotRaw as Record<string, unknown>;
      const slot: StoredMediaSlot = {
        id: String(s.id ?? 'hero'),
        kind: s.kind === 'video' ? 'video' : 'image',
        aspect: String(s.aspect ?? '3/2'),
        label: String(s.label ?? 'Hero'),
        headline: s.headline != null ? String(s.headline) : undefined,
        body: s.body != null ? String(s.body) : undefined,
        bodySecondary: s.bodySecondary != null ? String(s.bodySecondary) : undefined,
        ctaLabel: s.ctaLabel != null ? String(s.ctaLabel) : undefined,
        href: s.href != null ? String(s.href) : undefined,
        imageKey: String(s.imageKey ?? 'familysplash2'),
      };
      return { type: 'hero', slot, ctas: asCtas(o.ctas) };
    }
    case 'story':
      return {
        type: 'story',
        heading: String(o.heading ?? ''),
        body: String(o.body ?? ''),
        imageKey: String(o.imageKey ?? 'familysplash2'),
        cta: asCta(o.cta) ?? undefined,
      };
    case 'categories': {
      const cardsRaw = o.cards;
      const cards = Array.isArray(cardsRaw)
        ? cardsRaw
            .map((c) => {
              if (!c || typeof c !== 'object') return null;
              const card = c as Record<string, unknown>;
              return {
                label: String(card.label ?? ''),
                category: String(card.category ?? ''),
                imageKey: String(card.imageKey ?? 'familysplash2'),
              };
            })
            .filter((c): c is StoredCategoryCard => Boolean(c?.label && c.category))
        : undefined;
      return {
        type: 'categories',
        heading: o.heading != null ? String(o.heading) : undefined,
        body: o.body != null ? String(o.body) : undefined,
        cards,
      };
    }
    case 'products':
      return {
        type: 'products',
        heading: String(o.heading ?? ''),
        body: o.body != null ? String(o.body) : undefined,
        productIds: Array.isArray(o.productIds)
          ? o.productIds.map((id) => String(id)).filter(Boolean)
          : [],
      };
    case 'cta_row':
      return { type: 'cta_row', ctas: asCtas(o.ctas) };
    case 'ask_rav': {
      const prompts = Array.isArray(o.prompts)
        ? o.prompts.map((p) => String(p).trim()).filter(Boolean)
        : o.prompts === null
          ? []
          : undefined;
      return {
        type: 'ask_rav',
        eyebrow: o.eyebrow != null ? String(o.eyebrow) : undefined,
        headline: o.headline != null ? String(o.headline) : undefined,
        body: o.body != null ? String(o.body) : undefined,
        placeholder: o.placeholder != null ? String(o.placeholder) : undefined,
        prompts,
      };
    }
    default:
      return null;
  }
}

function toStoredDoc(id: string, data: DocumentData): StoredLandingDoc | null {
  const sectionsRaw = data.sections;
  if (!Array.isArray(sectionsRaw)) return null;
  const sections = sectionsRaw
    .map(parseStoredSection)
    .filter((s): s is StoredLandingSection => s != null);
  return {
    id,
    path: String(data.path ?? ''),
    legacyPaths: Array.isArray(data.legacyPaths)
      ? data.legacyPaths.map((p) => String(p))
      : undefined,
    navLabel: String(data.navLabel ?? id),
    utmCampaigns: Array.isArray(data.utmCampaigns)
      ? data.utmCampaigns.map((c) => String(c))
      : [],
    chrome: data.chrome === 'storefront' ? 'storefront' : 'minimal',
    primarySuccess: data.primarySuccess === 'gift_start' ? 'gift_start' : 'start_box',
    sections,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
  };
}

export function hydrateLandingConfig(
  stored: StoredLandingDoc,
  fallbackId: LandingAudienceId
): LandingAudienceConfig {
  const sections: LandingSection[] = stored.sections.map((section) => {
    switch (section.type) {
      case 'hero':
        return {
          type: 'hero',
          slot: {
            ...section.slot,
            src: landingMediaSource(section.slot.imageKey),
          },
          ctas: section.ctas,
        };
      case 'story':
        return {
          type: 'story',
          heading: section.heading,
          body: section.body,
          image: landingMediaSource(section.imageKey),
          cta: section.cta,
        };
      case 'categories':
        return {
          type: 'categories',
          heading: section.heading,
          body: section.body,
          cards: section.cards?.map((c) => ({
            label: c.label,
            category: c.category,
            image: landingMediaSource(c.imageKey),
          })),
        };
      case 'products':
        return {
          type: 'products',
          heading: section.heading,
          body: section.body,
          productIds: section.productIds,
        };
      case 'cta_row':
        return { type: 'cta_row', ctas: section.ctas };
      case 'ask_rav':
        return {
          type: 'ask_rav',
          eyebrow: section.eyebrow,
          headline: section.headline,
          body: section.body,
          placeholder: section.placeholder,
          prompts: section.prompts,
        };
      default:
        return section;
    }
  });

  return {
    id: (stored.id as LandingAudienceId) || fallbackId,
    path: stored.path,
    legacyPaths: stored.legacyPaths,
    navLabel: stored.navLabel,
    utmCampaigns: stored.utmCampaigns,
    chrome: stored.chrome,
    primarySuccess: stored.primarySuccess,
    sections,
  };
}

/** Convert runtime / code-config landing into a Firestore-serializable doc. */
export function serializeLandingConfig(config: LandingAudienceConfig): StoredLandingDoc {
  const sections: StoredLandingSection[] = config.sections.map((section) => {
    switch (section.type) {
      case 'hero': {
        const { src, ...rest } = section.slot;
        return {
          type: 'hero',
          slot: {
            ...rest,
            imageKey: landingMediaKeyForSource(
              (src ?? landingMediaSource('familysplash2')) as import('react-native').ImageSourcePropType
            ),
          },
          ctas: section.ctas,
        };
      }
      case 'story':
        return {
          type: 'story',
          heading: section.heading,
          body: section.body,
          imageKey: landingMediaKeyForSource(section.image),
          cta: section.cta,
        };
      case 'categories':
        return {
          type: 'categories',
          heading: section.heading,
          body: section.body,
          cards: section.cards?.map((c) => ({
            label: c.label,
            category: c.category,
            imageKey: landingMediaKeyForSource(c.image),
          })),
        };
      case 'products':
        return {
          type: 'products',
          heading: section.heading,
          body: section.body,
          productIds: section.productIds,
        };
      case 'cta_row':
        return { type: 'cta_row', ctas: section.ctas };
      case 'ask_rav':
        return {
          type: 'ask_rav',
          eyebrow: section.eyebrow,
          headline: section.headline,
          body: section.body,
          placeholder: section.placeholder,
          prompts: section.prompts,
        };
      default:
        return section;
    }
  });

  return {
    id: config.id,
    path: config.path,
    legacyPaths: config.legacyPaths,
    navLabel: config.navLabel,
    utmCampaigns: config.utmCampaigns,
    chrome: config.chrome,
    primarySuccess: config.primarySuccess,
    sections,
  };
}

export const landingsService = {
  async getById(id: string): Promise<StoredLandingDoc | null> {
    const ref = landingDocRef(id);
    if (!ref) return null;
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return toStoredDoc(snap.id, snap.data());
  },

  async listIds(): Promise<string[]> {
    const col = landingsCollection();
    if (!col) return [];
    const snap = await getDocs(col);
    return snap.docs.map((d) => d.id);
  },

  async listAll(): Promise<StoredLandingDoc[]> {
    const col = landingsCollection();
    if (!col) return [];
    const snap = await getDocs(col);
    return snap.docs
      .map((d) => toStoredDoc(d.id, d.data()))
      .filter((d): d is StoredLandingDoc => d != null);
  },

  async upsert(docData: StoredLandingDoc): Promise<StoredLandingDoc> {
    const ref = landingDocRef(docData.id);
    if (!ref) throw new Error('Firestore unavailable');
    const payload: StoredLandingDoc = {
      ...docData,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(ref, omitUndefinedDeep(payload) as DocumentData, { merge: true });
    return payload;
  },

  async remove(id: string): Promise<void> {
    const ref = landingDocRef(id);
    if (!ref) throw new Error('Firestore unavailable');
    await deleteDoc(ref);
  },
};
