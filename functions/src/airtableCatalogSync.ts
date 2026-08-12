/**
 * Airtable → Firestore catalog replace sync.
 *
 * Source of truth: Grapejuice base Full Catalog (Listings) + Hanukkah Books.
 * Writes catalog/hanukkah/items/* and deletes orphans not in the synced set.
 *
 * Env:
 *   AIRTABLE_PAT — Personal access token with data.records:read + schema.bases:read
 *   AIRTABLE_BASE_ID — defaults to appQscrPCQUIj4shh
 *   CATALOG_SYNC_SECRET — shared secret for HTTP trigger (Authorization: Bearer …)
 */
import * as logger from 'firebase-functions/logger';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'crypto';
import sharp = require('sharp');

export const AIRTABLE_BASE_ID_DEFAULT = 'appQscrPCQUIj4shh';
export const FULL_CATALOG_TABLE_ID = 'tblCUCVfohWTQy8fP';
export const BOOKS_TABLE_ID = 'tbleo48j2H34DRAu1';
export const CATALOG_HOLIDAY = 'hanukkah';

const F = {
  id: 'fldSPjarW6aFocHj3',
  description: 'fldMEo3Bys38SVisV',
  inProduction: 'fldN3303eOahUbJFU',
  inventory: 'fldXpTJPasuaXfoeW',
  unitCost: 'fldJNKCjYA1aLC2KU',
  memberPrice: 'fldSKmIeWfuRoB2IC',
  nonMemberPrice: 'fld9ipf5vOEkaMGes',
  category: 'fldDZqfGn1nrSDnwx',
  source: 'fldTuhfkRLcdVafg3',
  context: 'flduPd4VJSCm3Q8wz',
  age: 'fld19V2PBeilijWg5',
  agesForSwaps: 'fldtaNkpIzy40hsut',
  primaryImage: 'fld0nkf58rYVbWhZJ',
  otherImages: 'fldKFSK4F2FoD7QR6', // Airtable "Other Images" (secondary gallery)
  link: 'fldicpeRi2dctILQa',
  activity: 'fldZT5VtqtaN1TGE3',
  dimensions: 'fldbq5sCX6csZLV2h',
  weight: 'fldxxYMcA3qrDNdZa',
  materials: 'fldTO5IDBFvggJd7Y',
  whatsIncluded: 'fldQhql0JV2mby273',
  careNotes: 'fldXM6Az08OFmvWC9',
  /** Multi-select: most-loved | menorahs-collection | menorahs-kids | dreidels | … */
  storefrontRails: 'fld87IqgLUYTCYbfd',
  /** Number — lower shows first within a rail. */
  storefrontRank: 'fldL8ywPdWjiWDJYs',
  /** singleSelect: collection | kids — merged into storefrontRails as menorahs-* */
  menorahHomepage: 'fld11aALd1jA7S2Oh',
  /** singleSelect: collection | kids — merged into storefrontRails as dreidels-* */
  dreidelHomepage: 'fldtNYSxTNtwO9TMg',
} as const;

const B = {
  title: 'fldCZVbxyEy7pFpl5',
  author: 'fldJTYzX1VZANE32g',
  buyLink: 'fldoDsu0A2i6WPzd1',
  /** Primary Image — same role as Full Catalog Primary Image. */
  primaryImage: 'fldPIYO00g9QwhpVC',
  /** Other Images — secondary gallery, same role as Full Catalog Other Images. */
  otherImages: 'fldlxFU6PXF2LWutu',
  defaultForAge: 'fldZcr2Dzq9JivS7u',
  age: 'fldCQ9GdNJMI4f300',
  interest: 'fld0HXR8bybF5jJlf',
  cut: 'fldRZaX3mVlFqWntD',
  /** Free-text approx price, e.g. "$8-18 depending on edition". */
  price: 'fldP8mVb5xMC9CQg3',
  unitCost: 'fldocbJQ59NOnn52q',
  memberPrice: 'fldDxCYzoVa8kECiK',
  nonMemberPrice: 'fld98ErDMv4fjIXNV',
  description: 'fld4sz0NbEfYURoas',
  whatsIncluded: 'fldibf87uviMr3F1p',
  careNotes: 'fldOgYIzuMOiKypF8',
  storefrontRails: 'fldQ0rtV9eQBoJnlj',
} as const;

type AirtableAttachment = {
  id?: string;
  url?: string;
  filename?: string;
  type?: string;
};

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type SyncedCatalogItem = {
  id: string;
  name: string;
  description: string;
  slot: 'base' | 'story' | 'gift' | 'addon' | 'keepsake';
  slotId: string;
  ageGroups: string[];
  defaultFor: string[];
  swapOptions: string[];
  unitCostCents: number;
  memberPriceCents: number;
  nonMemberPriceCents: number;
  /** Back-compat display / à la carte charge field */
  dollarCostCents: number;
  pricingTier: 'included' | 'perKid' | 'extra' | 'alaCarte';
  holiday: string;
  /** Full Airtable Category multi-select. */
  categories: string[];
  /** Primary category for placement (first non–On Sale, else first). */
  category: string | null;
  context: string[];
  source: string | null;
  inventory: number | null;
  airtableRecordId: string;
  airtableTable: 'full-catalog' | 'books';
  brand: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  buyLink: string | null;
  interest: string | null;
  curationTags: string[];
  /** Airtable "Storefront rails" multi-select (most-loved, menorahs, …). */
  storefrontRails: string[];
  /** Airtable "Storefront rank" — lower first; null when unset. */
  storefrontRank: number | null;
  dimensions: string | null;
  weight: string | null;
  materials: string | null;
  whatsIncluded: string | null;
  careNotes: string | null;
};

function requirePat(): string {
  const pat = process.env.AIRTABLE_PAT?.trim();
  if (!pat) throw new Error('AIRTABLE_PAT is not configured.');
  return pat;
}

function baseId(): string {
  return process.env.AIRTABLE_BASE_ID?.trim() || AIRTABLE_BASE_ID_DEFAULT;
}

export function slugifyCatalogId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'item';
}

function selectName(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'name' in v) {
    return String((v as { name: string }).name);
  }
  return null;
}

function selectNames(v: unknown): string[] {
  if (!Array.isArray(v)) {
    const one = selectName(v);
    return one ? [one] : [];
  }
  return v.map(selectName).filter((x): x is string => Boolean(x));
}

function numberField(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Merge Storefront rails multi-select + homepage single-selects into rail slugs. */
function storefrontRailsFromListing(f: Record<string, unknown>): string[] {
  const rails = new Set(selectNames(f[F.storefrontRails]));
  // Legacy single rail → collection
  if (rails.has('menorahs')) {
    rails.add('menorahs-collection');
    rails.delete('menorahs');
  }
  if (rails.has('dreidels')) {
    rails.add('dreidels-collection');
    rails.delete('dreidels');
  }
  const menorahHome = selectName(f[F.menorahHomepage])?.toLowerCase();
  if (menorahHome === 'collection') rails.add('menorahs-collection');
  if (menorahHome === 'kids') rails.add('menorahs-kids');
  const dreidelHome = selectName(f[F.dreidelHomepage])?.toLowerCase();
  if (dreidelHome === 'collection') rails.add('dreidels-collection');
  if (dreidelHome === 'kids') rails.add('dreidels-kids');
  return [...rails];
}

function textField(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function currencyToCents(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v * 100));
}

/**
 * High end of Hanukkah Books "Price (approx, USD)" free text.
 * Examples: "$4.99 board book" → 499; "$8-18 depending on edition" → 1800;
 * "$8-20 …; $24.99 gift ed." → 2499.
 */
export function parseApproxPriceHighCents(raw: unknown): number {
  const s = String(raw ?? '');
  if (!s.trim()) return 0;
  const amounts: number[] = [];
  const re = /~?\$?\s*(\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n)) continue;
    // Book prices are small; skip page counts / years accidentally captured.
    if (n <= 0 || n > 500) continue;
    amounts.push(n);
  }
  if (!amounts.length) return 0;
  return Math.max(0, Math.round(Math.max(...amounts) * 100));
}

function attachments(v: unknown): AirtableAttachment[] {
  if (!Array.isArray(v)) return [];
  return v.filter((a) => a && typeof a === 'object') as AirtableAttachment[];
}

function ageYearsToGroups(years: string[]): string[] {
  const groups = new Set<string>();
  for (const y of years) {
    const n = parseInt(y, 10);
    if (!Number.isFinite(n)) continue;
    if (n <= 2) groups.add('0-2');
    else if (n <= 5) groups.add('3-5');
    else if (n <= 8) groups.add('6-8');
    else groups.add('9-12');
  }
  return groups.size ? [...groups] : ['0-2', '3-5', '6-8', '9-12'];
}

function mapListingPlacement(category: string | null, contexts: string[], name: string) {
  const isAla = contexts.includes('A la carte');
  const lower = name.toLowerCase();
  const cat = (category ?? 'Other').toLowerCase();

  if (cat === 'book') {
    return { slot: 'story' as const, slotId: 'story', pricingTier: 'perKid' as const };
  }
  if (cat === 'menorah') {
    return {
      slot: 'keepsake' as const,
      slotId: isAla ? 'family-hanukkiah' : 'family-hanukkiah',
      pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included',
    };
  }
  if (cat === 'candles') {
    if (
      lower.includes('electric') ||
      lower.includes('sheet') ||
      lower.includes('roll your own')
    ) {
      return { slot: 'addon' as const, slotId: 'extra-candles', pricingTier: 'alaCarte' as const };
    }
    return { slot: 'base' as const, slotId: 'candles', pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included' };
  }
  if (cat === 'dreidel') {
    if (isAla || lower.includes('brass') || lower.includes('slipcast') || lower.includes('airdry')) {
      return { slot: 'keepsake' as const, slotId: 'keepsake-dreidel', pricingTier: 'alaCarte' as const };
    }
    return { slot: 'gift' as const, slotId: 'gift', pricingTier: 'perKid' as const };
  }
  if (cat === 'food') {
    if (lower.includes('latke')) {
      return { slot: 'base' as const, slotId: 'latke-kit', pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included' };
    }
    if (lower.includes('sufgan')) {
      return { slot: 'base' as const, slotId: 'sufganiyot-kit', pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included' };
    }
    if (lower.includes('applesauce')) {
      return { slot: 'base' as const, slotId: 'latke-recipe-printed', pricingTier: 'included' as const };
    }
    if (lower.includes('gelt')) {
      return { slot: 'base' as const, slotId: 'gelt', pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included' };
    }
    if (lower.includes('cookie')) {
      return { slot: 'addon' as const, slotId: 'decor', pricingTier: 'alaCarte' as const };
    }
    return { slot: 'base' as const, slotId: 'latke-kit', pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included' };
  }
  if (lower.includes('wrapping')) {
    return { slot: 'base' as const, slotId: 'wrapping', pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included' };
  }
  if (lower.includes('napkin')) {
    return { slot: 'addon' as const, slotId: 'decor', pricingTier: 'alaCarte' as const };
  }
  if (lower.includes('plush')) {
    return { slot: 'gift' as const, slotId: 'gift', pricingTier: 'alaCarte' as const };
  }
  return {
    slot: 'addon' as const,
    slotId: 'decor',
    pricingTier: (isAla ? 'alaCarte' : 'included') as 'alaCarte' | 'included',
  };
}

function primaryCategory(categories: string[]): string | null {
  const nonSale = categories.find((c) => c.toLowerCase() !== 'on sale');
  return nonSale ?? categories[0] ?? null;
}

function curationTagsFor(categories: string[]): string[] {
  const tags = new Set<string>(['collection']);
  for (const c of categories) {
    switch (c.toLowerCase()) {
      case 'menorah':
        tags.add('hanukkiah');
        break;
      case 'dreidel':
        tags.add('dreidel');
        break;
      default:
        break;
    }
  }
  return [...tags];
}

async function airtableListAll(tableId: string, fields: string[]): Promise<AirtableRecord[]> {
  const pat = requirePat();
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  const params = new URLSearchParams();
  for (const f of fields) params.append('fields[]', f);
  params.set('pageSize', '100');

  do {
    if (offset) params.set('offset', offset);
    else params.delete('offset');
    // Field map uses fld… IDs — ask Airtable to key the response the same way.
    params.set('returnFieldsByFieldId', 'true');
    const url = `https://api.airtable.com/v0/${baseId()}/${tableId}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable list failed (${res.status}): ${body.slice(0, 400)}`);
    }
    const json = (await res.json()) as { records?: AirtableRecord[]; offset?: string };
    out.push(...(json.records ?? []));
    offset = json.offset;
  } while (offset);

  return out;
}

async function toWebpBuffer(input: Buffer): Promise<Buffer> {
  // Catalog tiles rarely need >1600px; WebP keeps visual quality with far smaller bytes.
  const out = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  return Buffer.from(out);
}

async function mirrorAttachmentToStorage(
  itemId: string,
  kind: 'primary' | 'other',
  index: number,
  att: AirtableAttachment
): Promise<string | null> {
  if (!att.url) return null;
  const bucket = getStorage().bucket();
  const res = await fetch(att.url);
  if (!res.ok) {
    logger.warn('Failed to download Airtable attachment', { itemId, status: res.status });
    return null;
  }
  const raw = Buffer.from(await res.arrayBuffer());
  let buf: Buffer = raw;
  let ext = 'webp';
  let contentType = 'image/webp';
  try {
    buf = await toWebpBuffer(raw);
  } catch (e) {
    logger.warn('WebP convert failed — storing original', { itemId, error: String(e) });
    ext =
      (att.filename && att.filename.includes('.') ? att.filename.split('.').pop() : null) ||
      (att.type?.includes('png') ? 'png' : 'jpg');
    contentType = att.type || 'image/jpeg';
  }
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const finalPath = `catalog/${CATALOG_HOLIDAY}/items/${itemId}/${kind}-${index}-${hash}.${ext}`;
  const file = bucket.file(finalPath);
  await file.save(buf, {
    contentType,
    metadata: { cacheControl: 'public,max-age=86400' },
    resumable: false,
  });
  await file.makePublic().catch(() => undefined);
  const [meta] = await file.getMetadata();
  if (meta.mediaLink) {
    return `https://storage.googleapis.com/${bucket.name}/${finalPath}`;
  }
  const [signed] = await file.getSignedUrl({
    action: 'read',
    expires: '2099-01-01',
  });
  return signed;
}

async function resolveImages(
  itemId: string,
  primary: AirtableAttachment[],
  other: AirtableAttachment[]
): Promise<{ imageUrl: string | null; imageUrls: string[] }> {
  const urls: string[] = [];
  if (primary[0]) {
    const u = await mirrorAttachmentToStorage(itemId, 'primary', 0, primary[0]);
    if (u) urls.push(u);
  }
  for (let i = 0; i < other.length; i++) {
    const u = await mirrorAttachmentToStorage(itemId, 'other', i, other[i]);
    if (u) urls.push(u);
  }
  return { imageUrl: urls[0] ?? null, imageUrls: urls };
}

function listingToItem(
  rec: AirtableRecord,
  images: { imageUrl: string | null; imageUrls: string[] }
): SyncedCatalogItem | null {
  const f = rec.fields;
  const name = String(f[F.id] ?? '').trim();
  if (!name) return null;
  const inProd = selectName(f[F.inProduction]);
  if (inProd && inProd !== 'Yes') return null;

  const categories = selectNames(f[F.category]);
  const category = primaryCategory(categories);
  const contexts = selectNames(f[F.context]);
  const ages = selectNames(f[F.age]);
  const placement = mapListingPlacement(category, contexts, name);
  const unitCostCents = currencyToCents(f[F.unitCost]);
  const memberPriceCents = currencyToCents(f[F.memberPrice]);
  const nonMemberPriceCents = currencyToCents(f[F.nonMemberPrice]);
  const id = slugifyCatalogId(name);

  return {
    id,
    name,
    description: String(f[F.description] ?? '').trim() || name,
    slot: placement.slot,
    slotId: placement.slotId,
    ageGroups: ages.length ? ageYearsToGroups(ages) : ['0-2', '3-5', '6-8', '9-12'],
    defaultFor: contexts.includes('Default') ? ['0-2', '3-5', '6-8', '9-12'] : [],
    swapOptions: [],
    unitCostCents,
    memberPriceCents,
    nonMemberPriceCents,
    dollarCostCents: nonMemberPriceCents || memberPriceCents || unitCostCents,
    pricingTier: placement.pricingTier,
    holiday: CATALOG_HOLIDAY,
    categories,
    category,
    context: contexts,
    source: selectName(f[F.source]),
    inventory: typeof f[F.inventory] === 'number' ? (f[F.inventory] as number) : null,
    airtableRecordId: rec.id,
    airtableTable: 'full-catalog',
    brand: null,
    imageUrl: images.imageUrl,
    imageUrls: images.imageUrls,
    buyLink: typeof f[F.link] === 'string' ? (f[F.link] as string) : null,
    interest: null,
    curationTags: curationTagsFor(categories),
    storefrontRails: storefrontRailsFromListing(f),
    storefrontRank: numberField(f[F.storefrontRank]),
    dimensions: textField(f[F.dimensions]),
    weight: textField(f[F.weight]),
    materials: textField(f[F.materials]),
    whatsIncluded: textField(f[F.whatsIncluded]),
    careNotes: textField(f[F.careNotes]),
  };
}

function bookToItem(
  rec: AirtableRecord,
  images: { imageUrl: string | null; imageUrls: string[] }
): SyncedCatalogItem | null {
  const f = rec.fields;
  if (f[B.cut] === true) return null;
  const title = String(f[B.title] ?? '').trim();
  if (!title) return null;
  const age = selectName(f[B.age]);
  const ageGroups = age && age !== '-' ? ageYearsToGroups([age]) : ['0-2', '3-5', '6-8', '9-12'];
  const isDefault = f[B.defaultForAge] === true;
  const author = String(f[B.author] ?? '').trim();
  const id = `book-${slugifyCatalogId(title)}`;
  const priceCents =
    currencyToCents(f[B.memberPrice]) ||
    currencyToCents(f[B.nonMemberPrice]) ||
    currencyToCents(f[B.unitCost]) ||
    parseApproxPriceHighCents(f[B.price]);

  return {
    id,
    name: title,
    description: String(f[B.description] ?? '').trim() || (author ? `By ${author}` : title),
    slot: 'story',
    slotId: 'story',
    ageGroups,
    defaultFor: isDefault ? ageGroups : [],
    swapOptions: [],
    unitCostCents: priceCents,
    memberPriceCents: priceCents,
    nonMemberPriceCents: priceCents,
    dollarCostCents: priceCents,
    pricingTier: 'perKid',
    holiday: CATALOG_HOLIDAY,
    categories: ['Book'],
    category: 'Book',
    context: ['Default'],
    source: 'Curated',
    inventory: null,
    airtableRecordId: rec.id,
    airtableTable: 'books',
    brand: author || null,
    imageUrl: images.imageUrl,
    imageUrls: images.imageUrls,
    buyLink: typeof f[B.buyLink] === 'string' ? (f[B.buyLink] as string) : null,
    interest: selectName(f[B.interest]),
    curationTags: ['collection'],
    storefrontRails: selectNames(f[B.storefrontRails]),
    storefrontRank: null,
    dimensions: null,
    weight: null,
    materials: null,
    whatsIncluded: textField(f[B.whatsIncluded]),
    careNotes: textField(f[B.careNotes]),
  };
}

function wireBookSwaps(items: SyncedCatalogItem[]): void {
  const books = items.filter((i) => i.airtableTable === 'books');
  for (const book of books) {
    const peers = books
      .filter((b) => b.id !== book.id && b.ageGroups.some((g) => book.ageGroups.includes(g)))
      .map((b) => b.id)
      .slice(0, 8);
    book.swapOptions = peers;
  }
}

type BookRendering = {
  primary: AirtableAttachment[];
  other: AirtableAttachment[];
};

/** Filename stem for Full Catalog book renderings, e.g. `papa-s-latkes__primary.png` → `papa-s-latkes`. */
function renderingSlugFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const base = filename.replace(/\.[^.]+$/, '').replace(/__primary$/i, '');
  const slug = slugifyCatalogId(base);
  return slug === 'item' ? null : slug;
}

/**
 * Index Full Catalog Category=Book Primary Image renderings by title slug.
 * Many of these rows have no ID — only the attachment filename identifies the book.
 * Also indexes any `__primary` attachment filename (render pipeline naming).
 */
function buildFullCatalogBookRenderingIndex(
  listingRecs: AirtableRecord[]
): Map<string, BookRendering> {
  const index = new Map<string, BookRendering>();
  for (const rec of listingRecs) {
    const cats = selectNames(rec.fields[F.category]).map((c) => c.toLowerCase());
    const primary = attachments(rec.fields[F.primaryImage]);
    const other = attachments(rec.fields[F.otherImages]);
    if (!primary.length && !other.length) continue;
    const hasPrimaryNamedRendering = primary.some((a) =>
      /__primary\.(png|jpe?g|webp)$/i.test(a.filename || '')
    );
    if (!cats.includes('book') && !hasPrimaryNamedRendering) continue;
    const rendering: BookRendering = { primary, other };
    const keys = new Set<string>();
    const name = String(rec.fields[F.id] ?? '').trim();
    if (name) keys.add(slugifyCatalogId(name));
    for (const att of primary) {
      const slug = renderingSlugFromFilename(att.filename);
      if (slug) keys.add(slug);
    }
    for (const key of keys) {
      const existing = index.get(key);
      if (!existing || (primary.length && !existing.primary.length)) {
        index.set(key, rendering);
      }
    }
  }
  return index;
}

/** Prefer exact slug, then longest prefix/containment match (min 12 chars). */
function findBookRendering(
  title: string,
  index: Map<string, BookRendering>
): BookRendering | null {
  const slug = slugifyCatalogId(title);
  const exact = index.get(slug);
  if (exact) return exact;

  let bestKey: string | null = null;
  let bestScore = 0;
  for (const key of index.keys()) {
    if (key.length < 8 || slug.length < 8) continue;
    let score = 0;
    if (slug === key) score = key.length + 2;
    else if (slug.startsWith(key) || key.startsWith(slug)) {
      score = Math.min(key.length, slug.length);
    } else if (slug.includes(key) || key.includes(slug)) {
      score = Math.min(key.length, slug.length) - 1;
    }
    if (score >= 12 && score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey ? index.get(bestKey) ?? null : null;
}

export type CatalogSyncResult = {
  wrote: number;
  deleted: number;
  listings: number;
  books: number;
  skippedImages: number;
  /** Hanukkah Books that used a Full Catalog Primary Image rendering. */
  booksUsingFcPrimary: number;
  bookRenderingsIndexed: number;
};

export async function runAirtableCatalogReplaceSync(): Promise<CatalogSyncResult> {
  const db = getFirestore();
  const listingFields = Object.values(F);
  const bookFields = Object.values(B);

  const [listingRecs, bookRecs] = await Promise.all([
    airtableListAll(FULL_CATALOG_TABLE_ID, listingFields),
    airtableListAll(BOOKS_TABLE_ID, bookFields),
  ]);

  const items: SyncedCatalogItem[] = [];
  let skippedImages = 0;
  const bookRenderings = buildFullCatalogBookRenderingIndex(listingRecs);
  logger.info('Full Catalog book renderings indexed', { count: bookRenderings.size });

  for (const rec of listingRecs) {
    const name = String(rec.fields[F.id] ?? '').trim();
    if (!name) continue;
    // Book products come from Hanukkah Books; Full Catalog Book rows supply renderings only.
    const cats = selectNames(rec.fields[F.category]).map((c) => c.toLowerCase());
    if (cats.includes('book')) continue;
    const inProd = selectName(rec.fields[F.inProduction]);
    if (inProd && inProd !== 'Yes') continue;
    const id = slugifyCatalogId(name);
    const primary = attachments(rec.fields[F.primaryImage]);
    const other = attachments(rec.fields[F.otherImages]);
    let images = { imageUrl: null as string | null, imageUrls: [] as string[] };
    if (primary.length || other.length) {
      try {
        images = await resolveImages(id, primary, other);
      } catch (e) {
        skippedImages += 1;
        logger.warn('Image mirror failed', { id, error: String(e) });
      }
    }
    const item = listingToItem(rec, images);
    if (item) items.push(item);
  }

  let booksUsingFcPrimary = 0;
  for (const rec of bookRecs) {
    if (rec.fields[B.cut] === true) continue;
    const title = String(rec.fields[B.title] ?? '').trim();
    if (!title) continue;
    const id = `book-${slugifyCatalogId(title)}`;
    const bookPrimary = attachments(rec.fields[B.primaryImage]);
    const bookOther = attachments(rec.fields[B.otherImages]);
    const fc = findBookRendering(title, bookRenderings);

    // Book grid/PDP primary always comes from Full Catalog Primary Image when matched.
    // Hanukkah Books attachments are gallery-only (never the storefront primary).
    let primary: AirtableAttachment[] = [];
    let other: AirtableAttachment[] = [];
    if (fc?.primary.length) {
      primary = fc.primary;
      other = [...(fc.other ?? []), ...bookPrimary, ...bookOther];
      booksUsingFcPrimary += 1;
    } else {
      // No FC rendering yet — fall back so the SKU still has a photo.
      primary = bookPrimary;
      other = bookOther;
      logger.warn('No Full Catalog primary rendering for book', { id, title });
    }

    let images = { imageUrl: null as string | null, imageUrls: [] as string[] };
    if (primary.length || other.length) {
      try {
        images = await resolveImages(id, primary, other);
      } catch (e) {
        skippedImages += 1;
        logger.warn('Book image mirror failed', { id, error: String(e) });
      }
    }
    const item = bookToItem(rec, images);
    if (item) items.push(item);
  }
  logger.info('Books using Full Catalog primary renderings', { booksUsingFcPrimary });

  wireBookSwaps(items);

  if (items.length === 0) {
    throw new Error(
      'Airtable sync produced 0 items — refusing to delete Firestore catalog. Check PAT scopes and field mapping.'
    );
  }

  const col = db.collection('catalog').doc(CATALOG_HOLIDAY).collection('items');
  const existing = await col.listDocuments();
  const keep = new Set(items.map((i) => i.id));

  // Firestore batches max 500
  let wrote = 0;
  for (let i = 0; i < items.length; i += 400) {
    const chunk = items.slice(i, i + 400);
    const batch = db.batch();
    for (const item of chunk) {
      const { id, ...rest } = item;
      batch.set(
        col.doc(id),
        {
          ...rest,
          syncedFrom: 'airtable',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: false }
      );
      wrote += 1;
    }
    await batch.commit();
  }

  let deleted = 0;
  const toDelete = existing.filter((ref) => !keep.has(ref.id));
  for (let i = 0; i < toDelete.length; i += 400) {
    const chunk = toDelete.slice(i, i + 400);
    const batch = db.batch();
    for (const ref of chunk) {
      batch.delete(ref);
      deleted += 1;
    }
    await batch.commit();
  }

  await db.doc('catalog/hanukkah').set(
    {
      lastAirtableSyncAt: FieldValue.serverTimestamp(),
      lastAirtableSyncCounts: {
        wrote,
        deleted,
        listings: items.filter((i) => i.airtableTable === 'full-catalog').length,
        books: items.filter((i) => i.airtableTable === 'books').length,
      },
    },
    { merge: true }
  );

  return {
    wrote,
    deleted,
    listings: items.filter((i) => i.airtableTable === 'full-catalog').length,
    books: items.filter((i) => i.airtableTable === 'books').length,
    skippedImages,
    booksUsingFcPrimary,
    bookRenderingsIndexed: bookRenderings.size,
  };
}

export function assertCatalogSyncSecret(authHeader: string | undefined): void {
  const secret = process.env.CATALOG_SYNC_SECRET?.trim();
  if (!secret) throw new Error('CATALOG_SYNC_SECRET is not configured.');
  const expected = `Bearer ${secret}`;
  if (authHeader !== expected) {
    const err = new Error('Unauthorized');
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}
