import {
  LANDING_REGISTRY,
  landingAudienceById,
  landingAudienceFromPath,
  type LandingAudienceConfig,
} from '../constants/landingAudiences';
import {
  hydrateLandingConfig,
  landingsService,
  type StoredLandingDoc,
} from '../services/firestore/landings';

let cache: LandingAudienceConfig[] | null = null;
let inflight: Promise<LandingAudienceConfig[]> | null = null;

/** Drop cached merge so the next load picks up create/delete/save. */
export function invalidateLandingCatalog(): void {
  cache = null;
  inflight = null;
}

/**
 * Seeds ∪ Firestore docs (CMS overrides win; CMS-only pages appended).
 * Cached in-memory for path resolution + footer.
 */
export async function loadMergedLandings(): Promise<LandingAudienceConfig[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    let docs: StoredLandingDoc[] = [];
    try {
      docs = await landingsService.listAll();
    } catch {
      docs = [];
    }

    const seedIds = new Set(LANDING_REGISTRY.map((s) => s.id));
    const bySeedId = new Map(docs.map((d) => [d.id, d]));
    const merged: LandingAudienceConfig[] = [];

    for (const seed of LANDING_REGISTRY) {
      const stored = bySeedId.get(seed.id);
      merged.push(
        stored?.sections?.length ? hydrateLandingConfig(stored, seed.id) : seed
      );
    }

    for (const doc of docs) {
      if (seedIds.has(doc.id)) continue;
      if (!doc.sections?.length) continue;
      merged.push(hydrateLandingConfig(doc, doc.id));
    }

    cache = merged;
    inflight = null;
    return merged;
  })();

  return inflight;
}

/** Sync peek — seeds only until the first successful loadMergedLandings. */
export function peekMergedLandings(): LandingAudienceConfig[] {
  return cache ?? [...LANDING_REGISTRY];
}

export function landingFromMergedById(id: string | null | undefined): LandingAudienceConfig | null {
  if (!id) return null;
  const normalized = id === 'unaffiliated' ? 'cultural' : id;
  return (
    peekMergedLandings().find((l) => l.id === normalized) ??
    landingAudienceById(normalized)
  );
}

export function landingFromMergedByPath(pathname: string): LandingAudienceConfig | null {
  const path = pathname.replace(/\/$/, '') || '/';
  for (const audience of peekMergedLandings()) {
    if (audience.path === path) return audience;
    if (audience.legacyPaths?.includes(path)) return audience;
  }
  return landingAudienceFromPath(path);
}

export function isCodeSeedLandingId(id: string): boolean {
  return LANDING_REGISTRY.some((l) => l.id === id);
}
