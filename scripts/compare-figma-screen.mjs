#!/usr/bin/env node
/**
 * Generic Figma pixel-diff wrapper. Reuses compare-home-figma.mjs with custom paths.
 *
 * Usage:
 *   node scripts/compare-figma-screen.mjs <screen> [livePng] [figmaPng]
 *
 * Examples:
 *   node scripts/compare-figma-screen.mjs home
 *   node scripts/compare-figma-screen.mjs checkout assets/live-refs/checkout-live.png assets/mockup-refs/figma-checkout.png
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const compareScript = join(__dirname, 'compare-home-figma.mjs');

const screen = process.argv[2] ?? 'home';
const liveDefault = join(ROOT, 'assets/live-refs', `${screen}-live.png`);
const figmaDefault = join(ROOT, 'assets/mockup-refs', `figma-${screen}.png`);

const livePath = process.argv[3] ?? liveDefault;
const figmaPath = process.argv[4] ?? figmaDefault;

const result = spawnSync(process.execPath, [compareScript, livePath, figmaPath], {
  stdio: 'inherit',
  cwd: ROOT,
});

process.exit(result.status ?? 1);
