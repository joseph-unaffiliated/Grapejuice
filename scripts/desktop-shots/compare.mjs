/**
 * Compare two desktop screenshot sets pixel by pixel.
 *
 *   node scripts/desktop-shots/compare.mjs <baselineDir> <currentDir> [--allow id,id]
 *
 * Exit 1 when any screen differs by more than MAX_DIFF_RATIO of its pixels (or a
 * screen is missing), unless its id is listed in --allow (for changes that are
 * expected and explained). Diff images go next to the current screenshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [baselineDir, currentDir, ...rest] = process.argv.slice(2);
if (!baselineDir || !currentDir) {
  console.error('usage: compare.mjs <baselineDir> <currentDir> [--allow id,id]');
  process.exit(2);
}
const allowIdx = rest.indexOf('--allow');
const allow = new Set(allowIdx >= 0 ? (rest[allowIdx + 1] || '').split(',').filter(Boolean) : []);

/**
 * Sub-pixel text placement differs between builds on some pages (a column laid out at a
 * fractional x), which shows as thin bands of changed glyph pixels, about 0.1-0.2% of a
 * 1440x2200 page. A real layout change (a moved block, a missing row, a restyled bar) is
 * one to two orders of magnitude larger. Anything between NOISE and MAX is reported as
 * noise with its diff image kept for a look; above MAX fails the gate.
 */
const NOISE_RATIO = 0.0005;
const MAX_DIFF_RATIO = 0.003;

const ids = fs
  .readdirSync(baselineDir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.replace(/\.png$/, ''));

let failed = 0;
const rows = [];
for (const id of ids) {
  const a = path.join(baselineDir, `${id}.png`);
  const b = path.join(currentDir, `${id}.png`);
  if (!fs.existsSync(b)) {
    rows.push([id, 'missing', '']);
    if (!allow.has(id)) failed++;
    continue;
  }
  const A = PNG.sync.read(fs.readFileSync(a));
  const B = PNG.sync.read(fs.readFileSync(b));
  const width = Math.max(A.width, B.width);
  const height = Math.max(A.height, B.height);
  const pad = (img) => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height, fill: true });
    PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
    return out;
  };
  const pa = pad(A);
  const pb = pad(B);
  // Headless Chrome sometimes lays a page out one pixel off between runs (font metrics,
  // image column rounding), so compare against the baseline shifted by up to one pixel
  // in each direction and keep the closest match. Any real layout change is far larger.
  const shifted = (img, dx, dy) => {
    if (!dx && !dy) return img;
    const out = new PNG({ width, height, fill: true });
    const srcX = dx > 0 ? 0 : -dx;
    const dstX = dx > 0 ? dx : 0;
    const srcY = dy > 0 ? 0 : -dy;
    const dstY = dy > 0 ? dy : 0;
    PNG.bitblt(img, out, srcX, srcY, width - Math.abs(dx), height - Math.abs(dy), dstX, dstY);
    return out;
  };
  let best = null;
  outer: for (const dy of [0, -1, 1]) {
    for (const dx of [0, -1, 1]) {
      const candidate = new PNG({ width, height });
      const count = pixelmatch(shifted(pa, dx, dy).data, pb.data, candidate.data, width, height, { threshold: 0.12, includeAA: false });
      if (!best || count < best.count) best = { count, diff: candidate, dx, dy };
      if (count === 0) break outer;
    }
  }
  const { count: n, diff } = best;
  const ratio = n / (width * height);
  const sizeNote = A.width !== B.width || A.height !== B.height ? ` size ${A.width}x${A.height} -> ${B.width}x${B.height}` : '';
  const ok = ratio <= MAX_DIFF_RATIO && !sizeNote;
  const noisy = ok && ratio > NOISE_RATIO;
  if (!ok || noisy) fs.writeFileSync(path.join(currentDir, `${id}.diff.png`), PNG.sync.write(diff));
  if (!ok && !allow.has(id)) failed++;
  rows.push([id, ok ? (noisy ? 'same (noise)' : 'same') : allow.has(id) ? 'changed (allowed)' : 'CHANGED', `${(ratio * 100).toFixed(3)}%${sizeNote}`]);
}
for (const [id, status, note] of rows) console.log(`${status.padEnd(18)} ${id.padEnd(16)} ${note}`);
console.log(failed ? `\n${failed} screen(s) changed. Diffs written next to the current screenshots.` : '\nDesktop unchanged.');
if (process.env.GJ_COMPARE_JSON) fs.writeFileSync(process.env.GJ_COMPARE_JSON, JSON.stringify(rows.filter((r) => r[1] === 'CHANGED' || r[1] === 'missing').map((r) => r[0])));
process.exit(failed ? 1 : 0);
