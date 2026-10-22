import * as logger from './logger';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'crypto';
import sharp = require('sharp');

/**
 * Product cards for the guest-box recovery emails (event data `items`).
 *
 * Catalog images are WebP, which desktop Outlook and some webmail clients cannot show, so each
 * card gets a JPG copy under email/catalog/ in the default bucket, made on first use and reused.
 * No child names or ages are included.
 */

export type EmailItem = {
  name: string;
  image_url: string;
  caption: string;
  quantity: number;
  price: string;
  url: string;
};

const CATALOG_ITEMS = 'catalog/hanukkah/items';
const MAX_BOX_ITEMS = 6;
const MAX_PICKS = 3;
const IMAGE_PX = 600;

type CatalogDoc = FirebaseFirestore.DocumentData;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function formatPrice(cents: unknown): string {
  const n = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  if (n <= 0) return '';
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}

/** `card`: 600px square on white (product shots). `hero`: 600px wide, original proportions (photos). */
type ImageShape = 'card' | 'hero';

async function emailImageUrl(itemId: string, sourceUrl: string, shape: ImageShape = 'card'): Promise<string | null> {
  const bucket = getStorage().bucket();
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10);
  const path = `email/catalog/${itemId}-${hash}${shape === 'hero' ? '-hero' : ''}.jpg`;
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (exists) return publicUrl;
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    logger.warn('emailItems: image download failed', { itemId, status: res.status });
    return null;
  }
  const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    .resize(
      shape === 'hero'
        ? { width: IMAGE_PX, withoutEnlargement: true }
        : { width: IMAGE_PX, height: IMAGE_PX, fit: 'contain', background: '#ffffff' }
    )
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  await file.save(jpg, {
    contentType: 'image/jpeg',
    metadata: { cacheControl: 'public,max-age=604800' },
    resumable: false,
  });
  await file.makePublic().catch(() => undefined);
  return publicUrl;
}

/**
 * 600px JPG of an item's secondary photo (`imageUrls[1]`, kept at its own proportions) or main
 * photo (square card), falling back to the other.
 */
export async function catalogEmailImage(
  id: string,
  cat: CatalogDoc,
  prefer: 'secondary' | 'primary'
): Promise<string | null> {
  const urls = Array.isArray(cat.imageUrls) ? cat.imageUrls.filter((u): u is string => typeof u === 'string') : [];
  const primary = typeof cat.imageUrl === 'string' ? cat.imageUrl : urls[0];
  const secondary = urls[1];
  const order = prefer === 'secondary' ? [secondary, primary] : [primary, secondary];
  for (const source of order) {
    if (!source) continue;
    const image = await emailImageUrl(id, source, prefer === 'secondary' && source === secondary ? 'hero' : 'card');
    if (image) return image;
  }
  return null;
}

async function toEmailItem(
  id: string,
  cat: CatalogDoc,
  opts: { quantity: number; url: string; withPrice: boolean }
): Promise<EmailItem | null> {
  const source = typeof cat.imageUrl === 'string' ? cat.imageUrl : null;
  if (!source) return null;
  const image = await emailImageUrl(id, source);
  if (!image) return null;
  return {
    name: String(cat.name ?? id),
    image_url: image,
    caption: typeof cat.category === 'string' ? cat.category : '',
    quantity: opts.quantity,
    price: opts.withPrice ? formatPrice(cat.nonMemberPriceCents) : '',
    url: opts.url,
  };
}

/** Up to six distinct items from a saved guest box, in box order; every card links to the resume URL. */
export async function boxEmailItems(
  db: FirebaseFirestore.Firestore,
  snapshot: unknown,
  resumeUrl: string
): Promise<{ items: EmailItem[]; more: number }> {
  const guest = isRecord(snapshot) && isRecord(snapshot.guest) ? snapshot.guest : {};
  return lineItemsEmailItems(db, guest.lineItems, resumeUrl);
}

/** Up to six distinct items from box `lineItems` (guest snapshot or household draft); every card links to `url`. */
export async function lineItemsEmailItems(
  db: FirebaseFirestore.Firestore,
  lineItems: unknown,
  url: string
): Promise<{ items: EmailItem[]; more: number }> {
  const lines = Array.isArray(lineItems) ? lineItems : [];
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!isRecord(line) || typeof line.itemId !== 'string') continue;
    const qty = typeof line.quantity === 'number' ? line.quantity : 0;
    if (qty <= 0) continue;
    quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + qty);
  }
  const ids = [...quantities.keys()];
  if (!ids.length) return { items: [], more: 0 };
  const snaps = await db.getAll(...ids.map((id) => db.doc(`${CATALOG_ITEMS}/${id}`)));
  const ranked = snaps
    .map((snap, index) => ({ snap, index }))
    .filter((row) => row.snap.exists)
    .sort(
      (a, b) =>
        boxThumbTier(a.snap.id, a.snap.data() ?? {}) - boxThumbTier(b.snap.id, b.snap.data() ?? {}) || a.index - b.index
    );
  const items: EmailItem[] = [];
  for (const { snap } of ranked) {
    if (items.length >= MAX_BOX_ITEMS) break;
    const item = await toEmailItem(snap.id, snap.data() ?? {}, {
      quantity: quantities.get(snap.id) ?? 1,
      url,
      withPrice: false,
    });
    if (item) items.push(item);
  }
  return { items, more: Math.max(0, ranked.length - items.length) };
}

/** `items_partial` is true when the box has more items than the six cards. */
export function boxThumbFields(picked: { items: EmailItem[]; more: number }): { items: EmailItem[]; items_partial: boolean } {
  return { items: picked.items, items_partial: picked.more > 0 };
}

function catCategory(cat: CatalogDoc): string {
  return typeof cat.category === 'string' ? cat.category.trim().toLowerCase() : '';
}

function catSections(cat: CatalogDoc): string[] {
  return Array.isArray(cat.boxSections) ? cat.boxSections.map((s) => String(s).trim().toLowerCase()) : [];
}

function isBookDoc(id: string, cat: CatalogDoc): boolean {
  const category = catCategory(cat);
  return id.startsWith('book-') || category === 'book' || category === 'books' || catSections(cat).some((s) => s === 'story' || s === 'books' || s.includes('tell the story'));
}

function isGiftDoc(id: string, cat: CatalogDoc): boolean {
  const category = catCategory(cat);
  if (category === 'stuffies' || category === 'gift' || category === 'gifts' || category === 'wrapping') return true;
  if (catSections(cat).some((s) => s === 'gifts' || s === 'presents' || s.includes('present'))) return true;
  const slot = typeof cat.slotId === 'string' ? cat.slotId : '';
  if (slot === 'wrapping' || slot === 'wrapping-paper' || slot === 'pre-wrap') return true;
  return /wrapping|stuffie/.test(id);
}

function isFoodDoc(id: string, cat: CatalogDoc): boolean {
  if (catCategory(cat) === 'stuffies' || /stuffie/.test(id)) return false;
  if (catCategory(cat) === 'food') return true;
  if (catSections(cat).some((s) => s === 'food' || s.includes('eat'))) return true;
  return /latke-kit|latke-mix|sufganiyot|applesauce/.test(id);
}

/** Gifts and books first, food last, original order kept within a tier. */
function boxThumbTier(id: string, cat: CatalogDoc): number {
  if (isFoodDoc(id, cat)) return 2;
  if (isBookDoc(id, cat) || isGiftDoc(id, cat)) return 0;
  return 1;
}

/** Storefront items to suggest adding: not in `exclude`, not sold out, "most loved" first, then by storefront rank. */
export async function suggestEmailItems(
  db: FirebaseFirestore.Firestore,
  exclude: Set<string>,
  soldOut: Set<string>,
  utm: string,
  limit = MAX_PICKS
): Promise<EmailItem[]> {
  const snap = await db.collection(CATALOG_ITEMS).get();
  const rank = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const data = d.data();
    const loved = Array.isArray(data.storefrontRails) && data.storefrontRails.includes('most-loved') ? 0 : 1;
    const r = typeof data.storefrontRank === 'number' ? data.storefrontRank : Infinity;
    return [loved, r] as const;
  };
  const ranked = snap.docs
    .filter((d) => !exclude.has(d.id) && !soldOut.has(d.id) && Array.isArray(d.data().storefrontRails) && d.data().storefrontRails.length > 0)
    .sort((a, b) => {
      const [al, ar] = rank(a);
      const [bl, br] = rank(b);
      return al - bl || ar - br;
    });
  const origin = process.env.GJ_APP_ORIGIN?.trim() || 'https://grapejuice.co';
  const items: EmailItem[] = [];
  for (const doc of ranked) {
    if (items.length >= limit) break;
    const item = await toEmailItem(doc.id, doc.data(), {
      quantity: 1,
      url: `${origin}/product/${encodeURIComponent(doc.id)}?${utm}`,
      withPrice: true,
    });
    if (item) items.push(item);
  }
  return items;
}

/** The most recent sold-out book swapped out of this draft (`hh_<id>` or `guest_<visitorId>`), as a card. */
export async function soldOutBookItem(
  db: FirebaseFirestore.Firestore,
  draftKey: string,
  url: string
): Promise<EmailItem | null> {
  const swaps = await db.collection('inventorySwaps').where('draftKey', '==', draftKey).get();
  const recent = swaps.docs.sort((a, b) => {
    const at = (d: FirebaseFirestore.QueryDocumentSnapshot) => d.data().swappedAt?.toMillis?.() ?? 0;
    return at(b) - at(a);
  });
  for (const swap of recent) {
    const id = swap.data().fromItemId;
    if (typeof id !== 'string') continue;
    const cat = await db.doc(`${CATALOG_ITEMS}/${id}`).get();
    if (!cat.exists || !isBookDoc(id, cat.data() ?? {})) continue;
    const item = await toEmailItem(id, cat.data() ?? {}, { quantity: 1, url, withPrice: false });
    if (item) return item;
  }
  return null;
}

/** Three "most loved" storefront products, for leads without a saved box. */
export async function pickEmailItems(db: FirebaseFirestore.Firestore, utm: string): Promise<EmailItem[]> {
  const snap = await db.collection(CATALOG_ITEMS).where('storefrontRails', 'array-contains', 'most-loved').get();
  const ranked = snap.docs.sort((a, b) => {
    const ar = typeof a.data().storefrontRank === 'number' ? a.data().storefrontRank : Infinity;
    const br = typeof b.data().storefrontRank === 'number' ? b.data().storefrontRank : Infinity;
    return ar - br;
  });
  const origin = process.env.GJ_APP_ORIGIN?.trim() || 'https://grapejuice.co';
  const items: EmailItem[] = [];
  for (const doc of ranked) {
    if (items.length >= MAX_PICKS) break;
    const item = await toEmailItem(doc.id, doc.data(), {
      quantity: 1,
      url: `${origin}/product/${encodeURIComponent(doc.id)}?${utm}`,
      withPrice: true,
    });
    if (item) items.push(item);
  }
  return items;
}
