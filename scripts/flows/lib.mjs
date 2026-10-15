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

/** Locator for the My Box summary bar (desktop float or phone sticky bar). */
export function boxSummaryLocator(page) {
  return page.locator('[data-testid="box-order-summary-float"], [data-testid="mobile-box-bar"]').first();
}

/** "Total $95" / "$100" from My Box's floating summary or phone bar. */
export async function readBoxTotalCents(page) {
  const text = await boxSummaryLocator(page).innerText();
  const normalized = text.replace(/\s+/g, ' ');
  const m =
    normalized.match(/Total\s*\$([\d,]+(?:\.\d{2})?)/) ||
    normalized.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (!m) throw new Error(`No total in: ${text}`);
  return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
}

export async function screenshot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/**
 * React Native Web often ignores Playwright's synthetic clicks. Dispatch a real
 * pointer/mouse sequence on the first match for `aria-label`, role+name, or text.
 */
export async function rnClick(page, { ariaLabel = null, role = null, name = null, text = null, nth = 0 } = {}) {
  const ok = await page.evaluate(
    ({ ariaLabel, role, name, text, nth }) => {
      const nameRe = name instanceof RegExp || (name && name.source) ? new RegExp(name.source || name, name.flags || '') : null;
      const textRe = text instanceof RegExp || (text && text.source) ? new RegExp(text.source || text, text.flags || '') : null;
      let nodes = [];
      if (ariaLabel) nodes = Array.from(document.querySelectorAll(`[aria-label="${ariaLabel}"]`));
      else if (role && nameRe) {
        nodes = Array.from(document.querySelectorAll(`[role="${role}"], ${role === 'button' ? 'button' : ''}`)).filter((el) =>
          nameRe.test((el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim())
        );
      } else if (textRe) {
        nodes = Array.from(document.querySelectorAll('[role="button"], button, a, [tabindex]')).filter((el) =>
          textRe.test((el.textContent || '').replace(/\s+/g, ' ').trim())
        );
      }
      const el = nodes[nth];
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    },
    {
      ariaLabel,
      role,
      name: name instanceof RegExp ? { source: name.source, flags: name.flags } : name,
      text: text instanceof RegExp ? { source: text.source, flags: text.flags } : text,
      nth,
    }
  );
  if (!ok) throw new Error(`rnClick: no match for ${JSON.stringify({ ariaLabel, role, name: String(name), text: String(text), nth })}`);
  return true;
}
