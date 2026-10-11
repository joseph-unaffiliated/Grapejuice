/**
 * Shared helpers for the browser flow scripts (desktop and mobile). Each flow
 * launches Chromium against the exported build served by scripts/desktop-shots/serve.mjs.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const BASE_URL = process.env.GJ_BASE_URL || 'http://127.0.0.1:5055';
export const TEST_EMAIL = (purpose) => `joseph+test-${purpose}@unaffiliated.co`;
export const FIXTURES = path.resolve('scripts/flows/fixtures');

export const DESKTOP = { viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 };
export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.0.0',
};

export async function launch({ device = DESKTOP, guestFixture = null, storageState = null, extraInit = null } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...device,
    reducedMotion: 'reduce',
    timezoneId: 'America/New_York',
    locale: 'en-US',
    ...(storageState ? { storageState } : {}),
  });
  if (guestFixture) {
    const value = typeof guestFixture === 'string' ? guestFixture : JSON.stringify(guestFixture);
    await context.addInitScript((v) => {
      try {
        window.localStorage.setItem('grapejuice-guest-session', v);
      } catch {}
    }, value);
  }
  if (extraInit) await context.addInitScript(extraInit);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { browser, context, page };
}

export async function settle(page, ms = 1200) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
}

export function readFixture(name) {
  const file = path.join(FIXTURES, `${name}.json`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** Path of a saved Playwright storage state (cookies, localStorage and IndexedDB, so the Firebase auth session comes along). */
export function storagePath(name) {
  const file = path.join(FIXTURES, `${name}.storage.json`);
  return fs.existsSync(file) ? file : null;
}

export async function saveStorage(context, name) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const file = path.join(FIXTURES, `${name}.storage.json`);
  await context.storageState({ path: file, indexedDB: true });
  return file;
}

export function writeFixture(name, value) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, `${name}.json`), typeof value === 'string' ? value : JSON.stringify(value));
}

/** "Total $95" from My Box's floating summary. */
export async function readBoxTotalCents(page) {
  const text = await page.locator('[data-testid="box-order-summary-float"]').innerText();
  const m = text.replace(/\s+/g, ' ').match(/Total\s*\$([\d,]+(?:\.\d{2})?)/);
  if (!m) throw new Error(`No total in: ${text}`);
  return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
}

export async function screenshot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
