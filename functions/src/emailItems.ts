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

async function emailImageUrl(itemId: string, sourceUrl: string): Promise<string | null> {
  const bucket = getStorage().bucket();
  const path = `email/catalog/${itemId}-${createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10)}.jpg`;
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
    .resize({ width: IMAGE_PX, height: IMAGE_PX, fit: 'contain', background: '#ffffff' })
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
  const items: EmailItem[] = [];
  let available = 0;
  for (const snap of snaps) {
    if (!snap.exists) continue;
    available += 1;
    if (items.length >= MAX_BOX_ITEMS) continue;
    const item = await toEmailItem(snap.id, snap.data() ?? {}, {
      quantity: quantities.get(snap.id) ?? 1,
      url,
      withPrice: false,
    });
    if (item) items.push(item);
  }
  return { items, more: Math.max(0, available - items.length) };
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
