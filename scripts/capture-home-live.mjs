#!/usr/bin/env node
/**
 * Capture mobile homepage screenshots (viewport + key sections).
 * Usage: node scripts/capture-home-live.mjs [url]
 * Default URL: https://grapejuice-pilot.web.app
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REFS = join(ROOT, 'assets/live-refs');
const URL = process.argv[2] ?? 'https://grapejuice-pilot.web.app';
const VIEWPORT = { width: 393, height: 852 };

const GUEST_KEY = 'grapejuice-guest-session';
const FIGMA_COMPARE_KEY = 'grapejuice-figma-compare';
const guestExploreState = JSON.stringify({
  state: {
    exploreStarted: true,
    buildBoxPath: false,
    childDrafts: [],
    familiarityScore: 50,
    familiarityLevel: 'moderate',
    lineItems: [],
    ravNotes: '',
    onboardingComplete: false,
    boxRevealComplete: false,
    hiddenHolidays: [],
    interests: [],
    interestEmail: '',
    guestRavPromptCount: 0,
  },
  version: 0,
});

async function seedGuest(page) {
  await page.evaluate(
    ({ key, compareKey, value }) => {
      localStorage.setItem(key, value);
      localStorage.setItem(compareKey, '1');
    },
    { key: GUEST_KEY, compareKey: FIGMA_COMPARE_KEY, value: guestExploreState }
  );
  await page.reload({ waitUntil: 'load', timeout: 60_000 });
}

/** RN Web nests scroll in divs — scroll until target text is in view. */
async function scrollToText(page, text) {
  await page.evaluate((label) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.includes(label)) {
        let el = node.parentElement;
        while (el) {
          el.scrollTop = el.scrollHeight;
          el = el.parentElement;
        }
        node.parentElement?.scrollIntoView({ block: 'center', behavior: 'instant' });
        break;
      }
    }
    window.scrollTo(0, document.body.scrollHeight);
  }, text);
  await page.waitForTimeout(350);
}

async function main() {
  await mkdir(REFS, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });

  await page.goto(URL, { waitUntil: 'load', timeout: 60_000 });
  await seedGuest(page);

  await page.getByPlaceholder('Search or ask a question').waitFor({ state: 'visible', timeout: 30_000 });

  const topOut = join(REFS, 'home-live.png');
  await page.screenshot({ path: topOut, fullPage: false });
  console.log(`Top viewport → ${topOut}`);

  await page.getByText('Build your Collection').waitFor({ state: 'visible', timeout: 30_000 });
  await scrollToText(page, 'Build your Collection');
  const collectionOut = join(REFS, 'home-live-collection.png');
  await page.screenshot({ path: collectionOut, fullPage: false });
  console.log(`Collection viewport → ${collectionOut}`);

  await scrollToText(page, 'Dreidels');
  const dreidelsOut = join(REFS, 'home-live-dreidels.png');
  await page.screenshot({ path: dreidelsOut, fullPage: false });
  console.log(`Dreidels viewport → ${dreidelsOut}`);

  await scrollToText(page, 'Pre-register for Passover 2027');
  const passoverOut = join(REFS, 'home-live-passover.png');
  await page.screenshot({ path: passoverOut, fullPage: false });
  console.log(`Passover viewport → ${passoverOut}`);

  try {
    const card = page
      .locator('text=Pre-register for Passover 2027')
      .locator('xpath=ancestor::*[contains(., "%")][1]');
    await card.waitFor({ state: 'visible', timeout: 5_000 });
    await card.screenshot({ path: join(REFS, 'passover-card-live.png') });
    console.log(`Passover card crop → ${join(REFS, 'passover-card-live.png')}`);
  } catch {
    // fallback: crop by text block
    const block = page.locator('text=Pre-register for Passover 2027').first();
    await block.screenshot({ path: join(REFS, 'passover-card-live.png') });
    console.log(`Passover card crop (text) → ${join(REFS, 'passover-card-live.png')}`);
  }

  const fullOut = join(REFS, 'home-live-full.png');
  await page.screenshot({ path: fullOut, fullPage: true });
  console.log(`Full page → ${fullOut}`);

  console.log(`Source: ${URL}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
