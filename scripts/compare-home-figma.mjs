#!/usr/bin/env node
/**
 * Compare live/local home capture to Figma reference PNG.
 * Writes diff image + JSON report to assets/live-refs/
 *
 * Usage: node scripts/compare-home-figma.mjs [livePng] [figmaPng]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REFS = join(ROOT, 'assets/live-refs');
const MOCKUPS = join(ROOT, 'assets/mockup-refs');

const livePath = process.argv[2] ?? join(REFS, 'home-live.png');
const figmaPath =
  process.argv[3] ??
  (existsSync(join(MOCKUPS, 'figma-home-370-2949-full.png'))
    ? join(MOCKUPS, 'figma-home-370-2949-full.png')
    : join(MOCKUPS, 'figma-home-370-2949.png'));

const VIEWPORT_HEIGHT = 852;

/** Regions omitted from diff (intentional product vs stale Figma reference). */
const DIFF_MASKS = [
  { x: 0, y: VIEWPORT_HEIGHT - 88, width: 9999, height: 88, label: 'tab-bar' },
  { x: 280, y: 318, width: 113, height: 20, label: 'view-all-link' },
];

function applyMask(source, width, height, target) {
  for (const mask of DIFF_MASKS) {
    const x0 = Math.max(0, mask.x);
    const y0 = Math.max(0, mask.y);
    const x1 = Math.min(width, mask.x + mask.width);
    const y1 = Math.min(height, mask.y + mask.height);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (width * y + x) << 2;
        target.data[i] = source.data[i];
        target.data[i + 1] = source.data[i + 1];
        target.data[i + 2] = source.data[i + 2];
        target.data[i + 3] = source.data[i + 3];
      }
    }
  }
}

function loadPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function cropTop(img, height) {
  const out = new PNG({ width: img.width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = (img.width * y + x) << 2;
      const di = (img.width * y + x) << 2;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

function resizeCropToMatch(a, b) {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const crop = (img) => {
    const out = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (img.width * y + x) << 2;
        const di = (width * y + x) << 2;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    return out;
  };
  return [crop(a), crop(b)];
}

function main() {
  if (!existsSync(livePath)) {
    console.error(`Missing live capture: ${livePath}`);
    process.exit(1);
  }
  if (!existsSync(figmaPath)) {
    console.error(`Missing Figma reference: ${figmaPath}`);
    console.error('Run: bash scripts/capture-figma-home.sh');
    process.exit(1);
  }

  mkdirSync(REFS, { recursive: true });

  let live = loadPng(livePath);
  let figma = loadPng(figmaPath);
  if (figma.height > VIEWPORT_HEIGHT) {
    figma = cropTop(figma, VIEWPORT_HEIGHT);
  }
  if (live.height > VIEWPORT_HEIGHT) {
    live = cropTop(live, VIEWPORT_HEIGHT);
  }
  [live, figma] = resizeCropToMatch(live, figma);

  const liveForCompare = new PNG({ width: live.width, height: live.height });
  liveForCompare.data.set(live.data);
  applyMask(figma, live.width, live.height, liveForCompare);

  const diff = new PNG({ width: live.width, height: live.height });
  const mismatched = pixelmatch(liveForCompare.data, figma.data, diff.data, live.width, live.height, {
    threshold: 0.12,
    includeAA: false,
  });
  const total = live.width * live.height;
  const pct = ((mismatched / total) * 100).toFixed(2);

  const diffPath = join(REFS, 'home-diff.png');
  const reportPath = join(REFS, 'home-diff-report.json');
  writeFileSync(diffPath, PNG.sync.write(diff));
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        live: livePath,
        figma: figmaPath,
        width: live.width,
        height: live.height,
        mismatchedPixels: mismatched,
        totalPixels: total,
        mismatchPercent: Number(pct),
        masks: DIFF_MASKS.map(({ label }) => label),
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`Home diff: ${pct}% mismatched (${mismatched}/${total} px)`);
  console.log(`Diff image → ${diffPath}`);
  console.log(`Report → ${reportPath}`);
}

main();
