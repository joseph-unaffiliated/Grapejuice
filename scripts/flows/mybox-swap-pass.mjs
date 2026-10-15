/**
 * Hands-on swap-sheet pass: open every section's "Swap or add" sheet on the
 * joseph+test-mybox phone box and record option labels (Swap / Add · included / Add · +$X).
 *
 *   GJ_BASE_URL=http://localhost:8081 node scripts/flows/mybox-swap-pass.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch,
  settle,
  storagePath,
  boxSummaryLocator,
  screenshot,
  BASE_URL,
  PHONE,
} from './lib.mjs';
import { firestoreFromFirebaseCliLogin } from '../lib/firebaseCliCredential.mjs';

const OUT = path.resolve(process.env.GJ_FUZZ_OUT || 'tmp/flows/mybox-swap-pass');
const baseline = JSON.parse(fs.readFileSync('scripts/flows/fixtures/mybox-fuzz-baseline.json', 'utf8'));

async function softReset(page, db) {
  const users = await db.collection('users').where('email', '==', baseline.email).limit(1).get();
  const uid = users.docs[0].id;
  const householdId = users.docs[0].data().householdId;
  await db.doc(`households/${householdId}/boxDrafts/hanukkah-2026`).set(
    {
      holidayId: 'hanukkah-2026',
      lineItems: baseline.lineItems,
      wrapSelectedItemIds: baseline.wrapSelectedItemIds ?? [],
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
      lastChangeSource: 'box-fuzz-reset',
    },
    { merge: true }
  );
  await page.goto(`${BASE_URL}/box`, { waitUntil: 'load' });
  await boxSummaryLocator(page).waitFor({ timeout: 60_000 });
  await settle(page, 2500);
}

async function openSheet(page, openerIndex) {
  await page.evaluate((nth) => {
    const els = Array.from(document.querySelectorAll('[role="button"], button')).filter((el) =>
      /Swap or add|Add something/.test((el.textContent || '').replace(/\s+/g, ' ').trim())
    );
    const el = els[nth];
    if (!el) throw new Error(`no opener ${nth}`);
    el.scrollIntoView({ block: 'center' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }, openerIndex);
  await settle(page, 1200);
}

async function readSheet(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const buttons = Array.from(document.querySelectorAll('[role="button"], button'))
      .map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => /^(Swap|Add · included|Add · \+|Swap into|Add to)/.test(t) || /included|\+\$/.test(t));
    // Section title near the top of the sheet
    const heading =
      Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(-3) || [];
    return { heading, buttons: [...new Set(buttons)].slice(0, 40), snippet: text.slice(0, 800) };
  });
}

async function closeSheet(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await settle(page, 600);
}

async function main() {
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  const storage = storagePath('mybox-fuzz');
  if (!storage) throw new Error('Run mybox-seed.mjs first');
  fs.mkdirSync(OUT, { recursive: true });

  const { browser, page } = await launch({
    device: PHONE,
    storageState: storage,
    extraInit: () => {
      try {
        window.localStorage.setItem('grapejuice-box-fuzz', '1');
      } catch {}
    },
  });

  await softReset(page, db);
  const openerCount = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('[role="button"], button')).filter((el) =>
        /Swap or add|Add something/.test((el.textContent || '').replace(/\s+/g, ' ').trim())
      ).length
  );
  console.log(`found ${openerCount} swap-sheet openers`);

  const report = [];
  const issues = [];

  for (let i = 0; i < openerCount; i++) {
    await softReset(page, db);
    await openSheet(page, i);
    const sheet = await readSheet(page);
    await screenshot(page, OUT, `sheet-${String(i).padStart(2, '0')}`);
    const labels = sheet.buttons;
    const hasPaidAsSwap = labels.some((t) => /^Swap$/.test(t)) && labels.some((t) => /Add · \+/.test(t));
    // Flag: a button that says Swap but includes a dollar amount (paid swap leaked in).
    const paidSwapLeak = labels.filter((t) => /^Swap/.test(t) && /\$\d/.test(t));
    const entry = { opener: i, heading: sheet.heading, labels, paidSwapLeak };
    report.push(entry);
    console.log(`\n#${i} ${sheet.heading.join(' / ') || '(no heading)'}`);
    for (const l of labels.slice(0, 12)) console.log(`  · ${l}`);
    if (paidSwapLeak.length) {
      issues.push({ opener: i, kind: 'paid-swap-label', labels: paidSwapLeak });
      console.warn(`  ISSUE: paid amount on Swap label: ${paidSwapLeak.join('; ')}`);
    }
    // Napkins should never appear.
    if (/napkin/i.test(sheet.snippet)) {
      issues.push({ opener: i, kind: 'napkins' });
      console.warn('  ISSUE: napkins mentioned in sheet');
    }
    await closeSheet(page);
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ openerCount, report, issues }, null, 2));
  console.log(`\n${issues.length} issue(s). Report: ${OUT}/report.json`);
  await browser.close();
  process.exit(issues.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
