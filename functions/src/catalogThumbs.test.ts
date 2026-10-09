import assert from 'node:assert/strict';
import sharp = require('sharp');
import {
  CATALOG_THUMB_PX,
  mapWithConcurrency,
  storagePathFromPublicUrl,
  thumbMatchesFull,
  thumbPathFor,
  toThumbBuffer,
} from './catalogThumbs';

const BUCKET = 'grapejuice-pilot.firebasestorage.app';
const full = `https://storage.googleapis.com/${BUCKET}/catalog/hanukkah/items/latke-kit/primary-0-fad2029b3c90.webp`;
const thumb = `https://storage.googleapis.com/${BUCKET}/catalog/hanukkah/items/latke-kit/primary-0-fad2029b3c90.thumb.webp`;

assert.equal(
  thumbPathFor('catalog/hanukkah/items/x/other-2-abc.webp'),
  'catalog/hanukkah/items/x/other-2-abc.thumb.webp'
);
assert.equal(
  thumbPathFor('catalog/hanukkah/items/x/primary-0-abc.png'),
  'catalog/hanukkah/items/x/primary-0-abc.thumb.webp'
);

assert.equal(
  storagePathFromPublicUrl(full, BUCKET),
  'catalog/hanukkah/items/latke-kit/primary-0-fad2029b3c90.webp'
);
assert.equal(storagePathFromPublicUrl(`${full}?X-Goog-Signature=1`, BUCKET), null);
assert.equal(storagePathFromPublicUrl(full, 'other-bucket'), null);
assert.equal(storagePathFromPublicUrl(thumb, BUCKET), null);

assert.equal(thumbMatchesFull(full, thumb), true);
// Thumb from an older photo of the same item must not be paired with a new upload.
assert.equal(thumbMatchesFull(full.replace('fad2029b3c90', '000000000000'), thumb), false);
assert.equal(thumbMatchesFull(`${full}?sig=1`, thumb), false);

void (async () => {
  const order: number[] = [];
  let inFlight = 0;
  let peak = 0;
  const doubled = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5 * (8 - n)));
    inFlight -= 1;
    order.push(n);
    return n * 2;
  });
  assert.deepEqual(doubled, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
  assert.equal(order.length, 7);

  const big = await sharp({
    create: { width: 1600, height: 1600, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .webp()
    .toBuffer();
  const meta = await sharp(await toThumbBuffer(big)).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, CATALOG_THUMB_PX);
  assert.equal(meta.height, CATALOG_THUMB_PX);

  const small = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  const smallMeta = await sharp(await toThumbBuffer(small)).metadata();
  assert.equal(smallMeta.width, 300);
  assert.equal(smallMeta.height, 200);

  console.log('catalogThumbs tests passed');
})();
