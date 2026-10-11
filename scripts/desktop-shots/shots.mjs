/**
 * Desktop screenshot set for the "desktop doesn't change" gate.
 *
 *   node scripts/desktop-shots/shots.mjs <outDir> [baseUrl]
 *
 * Captures every screen in SCREENS at 1440x2200 (the app scrolls inside its own container, so a tall viewport is what covers a page) from the exported web
 * build served by serve.mjs. Videos are hidden and animations disabled so the
 * images are stable between runs. Pair with compare.mjs.
 *
 * Optional guest fixture: if scripts/flows/fixtures/guest-session.storage.json
 * exists (saved by scripts/flows/guest-box.mjs: cookies, localStorage and IndexedDB,
 * which carries the anonymous Firebase session), the screens marked `guest: true`
 * load with it, so My Box and checkout render with a box.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] || 'tmp/desktop-shots/current');
const baseUrl = process.argv[3] || 'http://127.0.0.1:5055';
const storagePath = path.resolve('scripts/flows/fixtures/guest-session.storage.json');
const fixture = fs.existsSync(storagePath) ? storagePath : null;

export const SCREENS = [
  { id: 'home', path: '/' },
  { id: 'collection', path: '/store/collection' },
  { id: 'stuffies', path: '/store/stuffies' },
  { id: 'product-lego', path: '/product/lego-menorah' },
  { id: 'cart', path: '/cart' },
  { id: 'gift', path: '/gift' },
  { id: 'candles', path: '/how-to/light-candles' },
  { id: 'dreidel', path: '/how-to/play-dreidel' },
  { id: 'box-new', path: '/box' },
  { id: 'checkout-new', path: '/checkout' },
  { id: 'account-new', path: '/account' },
  { id: 'login', path: '/login' },
  { id: 'box-guest', path: '/box', guest: true },
  { id: 'checkout-guest', path: '/checkout', guest: true },
  { id: 'home-guest', path: '/', guest: true },
];

const STABLE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  video { visibility: hidden !important; }
`;

async function settle(page) {
  // Firestore keeps a long-poll open, so "networkidle" never fires; use fixed waits.
  await page.waitForTimeout(3500);
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  // Lazy sections: scroll through the page once, then back to the top.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const screen of SCREENS) {
    if (screen.guest && !fixture) {
      results.push({ id: screen.id, skipped: 'no guest fixture' });
      continue;
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 2200 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      timezoneId: 'America/New_York',
      locale: 'en-US',
      ...(screen.guest ? { storageState: fixture } : {}),
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Freeze "today" so countdowns and date copy don't drift between runs within a day.
      const fixed = new Date();
      fixed.setHours(12, 0, 0, 0);
      const RealDate = Date;
      // @ts-ignore
      window.__shotNow = fixed.getTime();
      // eslint-disable-next-line no-global-assign
      Date = class extends RealDate {
        constructor(...args) {
          if (args.length === 0) return new RealDate(window.__shotNow);
          return new RealDate(...args);
        }
        static now() {
          return window.__shotNow;
        }
      };
    });
    await page.goto(baseUrl + screen.path, { waitUntil: 'load', timeout: 60_000 });
    await page.addStyleTag({ content: STABLE_CSS });
    await settle(page);
    const file = path.join(outDir, `${screen.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ id: screen.id, file, url: page.url() });
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(results, null, 2));
  for (const r of results) console.log(r.skipped ? `skip ${r.id} (${r.skipped})` : `ok   ${r.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
