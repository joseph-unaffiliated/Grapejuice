/**
 * Small WebP thumbnails beside each mirrored catalog photo, for grids, rails, cart and
 * order collages. A thumb lives next to its full image with the same content-hash name:
 *   catalog/hanukkah/items/{id}/primary-0-{hash}.webp → …/primary-0-{hash}.thumb.webp
 * so the same source photo always maps to the same thumb (idempotent), and the client can
 * check a thumb really belongs to its full URL before using it.
 *
 * Items store `imageThumbUrls`, parallel to `imageUrls` (null where no thumb exists yet).
 */
import * as logger from './logger';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp = require('sharp');

/** Covers a ~300 CSS px tile at 2x density; product photos are square. */
export const CATALOG_THUMB_PX = 600;
const THUMB_QUALITY = 80;
const THUMB_CACHE_CONTROL = 'public,max-age=86400';
const PUBLIC_PREFIX = 'https://storage.googleapis.com/';

export async function toThumbBuffer(input: Buffer): Promise<Buffer> {
  const out = await sharp(input)
    .rotate()
    .resize({
      width: CATALOG_THUMB_PX,
      height: CATALOG_THUMB_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toBuffer();
  return Buffer.from(out);
}

/** `…/primary-0-abc.webp` → `…/primary-0-abc.thumb.webp`. */
export function thumbPathFor(fullPath: string): string {
  return `${fullPath.replace(/\.[a-z0-9]+$/i, '')}.thumb.webp`;
}

/** Storage object path for a public catalog URL in this bucket, else null (e.g. signed URLs). */
export function storagePathFromPublicUrl(url: string, bucketName: string): string | null {
  const prefix = `${PUBLIC_PREFIX}${bucketName}/`;
  if (!url.startsWith(prefix) || url.includes('?')) return null;
  const path = url.slice(prefix.length);
  return path.startsWith('catalog/') && !path.includes('.thumb.') ? path : null;
}

/** True when `thumbUrl` was generated from `fullUrl` (same object name + `.thumb.webp`). */
export function thumbMatchesFull(fullUrl: string, thumbUrl: string): boolean {
  if (fullUrl.includes('?') || thumbUrl.includes('?')) return false;
  return thumbUrl === thumbPathFor(fullUrl);
}

export type EnsureThumbResult = { url: string | null; created: boolean };

/**
 * Return the public thumb URL for a mirrored full image, creating it when missing.
 * `fullBuffer` skips the download when the caller already has the bytes.
 * `allowCreate: false` only reuses an existing thumb (keeps sync runs inside their timeout).
 */
export async function ensureCatalogThumb(
  fullPath: string,
  opts: { fullBuffer?: Buffer; allowCreate?: boolean } = {}
): Promise<EnsureThumbResult> {
  const bucket = getStorage().bucket();
  const thumbPath = thumbPathFor(fullPath);
  const url = `${PUBLIC_PREFIX}${bucket.name}/${thumbPath}`;
  const thumb = bucket.file(thumbPath);
  const [exists] = await thumb.exists();
  if (exists) return { url, created: false };
  if (opts.allowCreate === false) return { url: null, created: false };

  let source = opts.fullBuffer;
  if (!source) {
    const [bytes] = await bucket.file(fullPath).download();
    source = bytes;
  }
  const buf = await toThumbBuffer(source);
  await thumb.save(buf, {
    contentType: 'image/webp',
    metadata: { cacheControl: THUMB_CACHE_CONTROL },
    resumable: false,
  });
  await thumb.makePublic().catch(() => undefined);
  return { url, created: true };
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export type CatalogThumbBackfillResult = {
  apply: boolean;
  items: number;
  images: number;
  alreadyHadThumb: number;
  /** Thumbs that exist (or would be created on apply) and are missing from the item doc. */
  toLink: number;
  created: number;
  itemsUpdated: number;
  skippedNonStorage: number;
  failed: number;
  /** True when `maxCreate` stopped the run early — call again to continue. */
  truncated: boolean;
};

/**
 * Generate missing thumbs from the photos already in Storage and write only
 * `imageThumbUrls` on each item. Safe to re-run; dry run (apply=false) writes nothing.
 */
export async function backfillCatalogThumbs(opts: {
  holiday: string;
  apply: boolean;
  maxCreate?: number;
  concurrency?: number;
}): Promise<CatalogThumbBackfillResult> {
  const db = getFirestore();
  const bucketName = getStorage().bucket().name;
  const maxCreate = Math.max(0, opts.maxCreate ?? 400);
  const concurrency = Math.min(8, Math.max(1, opts.concurrency ?? 4));
  const snap = await db
    .collection('catalog')
    .doc(opts.holiday)
    .collection('items')
    .select('imageUrls', 'imageThumbUrls')
    .get();

  const result: CatalogThumbBackfillResult = {
    apply: opts.apply,
    items: snap.size,
    images: 0,
    alreadyHadThumb: 0,
    toLink: 0,
    created: 0,
    itemsUpdated: 0,
    skippedNonStorage: 0,
    failed: 0,
    truncated: false,
  };
  let createBudget = maxCreate;

  await mapWithConcurrency(snap.docs, concurrency, async (docSnap) => {
    const data = docSnap.data();
    const urls = Array.isArray(data.imageUrls)
      ? (data.imageUrls as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    if (!urls.length) return;
    const prev = Array.isArray(data.imageThumbUrls) ? (data.imageThumbUrls as unknown[]) : [];
    const next: (string | null)[] = [];

    for (let i = 0; i < urls.length; i++) {
      result.images += 1;
      const full = urls[i];
      const had = typeof prev[i] === 'string' && thumbMatchesFull(full, prev[i] as string);
      if (had) {
        result.alreadyHadThumb += 1;
        next.push(prev[i] as string);
        continue;
      }
      const path = storagePathFromPublicUrl(full, bucketName);
      if (!path) {
        result.skippedNonStorage += 1;
        next.push(null);
        continue;
      }
      try {
        const allowCreate = opts.apply && createBudget > 0;
        if (allowCreate) createBudget -= 1;
        const ensured = await ensureCatalogThumb(path, { allowCreate });
        if (ensured.created) result.created += 1;
        else if (allowCreate) createBudget += 1;
        if (ensured.url) {
          result.toLink += 1;
          next.push(ensured.url);
        } else {
          if (opts.apply) result.truncated = true;
          else result.toLink += 1;
          next.push(null);
        }
      } catch (e) {
        result.failed += 1;
        logger.warn('Catalog thumb backfill failed', { itemId: docSnap.id, index: i, error: String(e) });
        next.push(null);
      }
    }

    const changed =
      prev.length !== next.length || next.some((thumb, i) => thumb !== (prev[i] ?? null));
    if (changed && opts.apply) {
      await docSnap.ref.update({ imageThumbUrls: next });
      result.itemsUpdated += 1;
    }
  });

  return result;
}
