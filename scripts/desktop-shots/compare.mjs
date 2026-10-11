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

/** Anti-aliasing and font hinting can move a handful of pixels; 0.05% is well under any real layout change. */
const MAX_DIFF_RATIO = 0.0005;

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
  const diff = new PNG({ width, height });
  const n = pixelmatch(pa.data, pb.data, diff.data, width, height, { threshold: 0.1, includeAA: true });
  const ratio = n / (width * height);
  const sizeNote = A.width !== B.width || A.height !== B.height ? ` size ${A.width}x${A.height} -> ${B.width}x${B.height}` : '';
  const ok = ratio <= MAX_DIFF_RATIO && !sizeNote;
  if (!ok) {
    fs.writeFileSync(path.join(currentDir, `${id}.diff.png`), PNG.sync.write(diff));
    if (!allow.has(id)) failed++;
  }
  rows.push([id, ok ? 'same' : allow.has(id) ? 'changed (allowed)' : 'CHANGED', `${(ratio * 100).toFixed(3)}%${sizeNote}`]);
}
for (const [id, status, note] of rows) console.log(`${status.padEnd(18)} ${id.padEnd(16)} ${note}`);
console.log(failed ? `\n${failed} screen(s) changed. Diffs written next to the current screenshots.` : '\nDesktop unchanged.');
process.exit(failed ? 1 : 0);
