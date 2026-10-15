/**
 * Phone-size My Box fuzz: random donate / quantity / restore / swap-sheet actions on
 * the resettable joseph+test-mybox account. After each step, reads window.__boxAudit
 * and fails the step (saves repro, soft-resets lines) when over-allowance problems appear.
 *
 * Prerequisites:
 *   GJ_BASE_URL=http://localhost:8081 node scripts/flows/mybox-seed.mjs
 *
 *   GJ_BASE_URL=http://localhost:8081 node scripts/flows/mybox-fuzz.mjs [--steps 40] [--seed 7]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  launch,
  settle,
  storagePath,
  readFixture,
  screenshot,
  boxSummaryLocator,
  rnClick,
  BASE_URL,
  PHONE,
} from './lib.mjs';
import { firestoreFromFirebaseCliLogin } from '../lib/firebaseCliCredential.mjs';

const stepsArg = process.argv.find((a) => a.startsWith('--steps='));
const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const STEPS = stepsArg ? Number(stepsArg.split('=')[1]) : Number(process.env.GJ_FUZZ_STEPS || 40);
const SEED = seedArg ? Number(seedArg.split('=')[1]) : Number(process.env.GJ_FUZZ_SEED || Date.now() % 1e9);
const OUT = path.resolve(process.env.GJ_FUZZ_OUT || `tmp/flows/mybox-fuzz-${SEED}`);

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  if (!arr.length) return null;
  return arr[Math.floor(rand() * arr.length)];
}

async function readAudit(page) {
  return page.evaluate(() => window.__boxAudit ?? null);
}

async function waitAudit(page, prevAt, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const snap = await readAudit(page);
    if (snap && (!prevAt || snap.at !== prevAt)) return snap;
    await page.waitForTimeout(250);
  }
  return readAudit(page);
}

async function softReset(page, db, baseline, email) {
  const users = await db.collection('users').where('email', '==', email).limit(1).get();
  if (users.empty) throw new Error(`No user for ${email}`);
  const uid = users.docs[0].id;
  const householdId = users.docs[0].data().householdId;
  if (!householdId) throw new Error('User has no householdId');
  const now = new Date().toISOString();
  await db.doc(`households/${householdId}/boxDrafts/hanukkah-2026`).set(
    {
      holidayId: 'hanukkah-2026',
      lineItems: baseline.lineItems,
      wrapSelectedItemIds: baseline.wrapSelectedItemIds ?? [],
      updatedAt: now,
      updatedBy: uid,
      lastChangeSource: 'box-fuzz-reset',
    },
    { merge: true }
  );
  await page.goto(`${BASE_URL}/box`, { waitUntil: 'load' });
  await boxSummaryLocator(page).waitFor({ timeout: 60_000 });
  await settle(page, 2500);
  return waitAudit(page, null);
}

async function countAria(page, label) {
  return page.evaluate((l) => document.querySelectorAll(`[aria-label="${l}"]`).length, label);
}

async function actionDonate(page, rand) {
  const n = await countAria(page, 'Donate');
  if (!n) return { ok: false, detail: 'no Donate' };
  const i = Math.floor(rand() * n);
  await rnClick(page, { ariaLabel: 'Donate', nth: i });
  return { ok: true, detail: `donate#${i}` };
}

async function actionUndoDonate(page, rand) {
  const n = await page.evaluate(
    () => Array.from(document.querySelectorAll('[aria-label]')).filter((el) => /^Undo donating /.test(el.getAttribute('aria-label') || '')).length
  );
  if (!n) return { ok: false, detail: 'no Undo donating' };
  const i = Math.floor(rand() * n);
  await page.evaluate((nth) => {
    const els = Array.from(document.querySelectorAll('[aria-label]')).filter((el) =>
      /^Undo donating /.test(el.getAttribute('aria-label') || '')
    );
    const el = els[nth];
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }, i);
  return { ok: true, detail: `undo-donate#${i}` };
}

async function actionQty(page, rand, dir) {
  const label = dir > 0 ? 'Increase quantity' : 'Decrease quantity';
  const n = await countAria(page, label);
  if (!n) return { ok: false, detail: `no ${label}` };
  const i = Math.floor(rand() * n);
  await rnClick(page, { ariaLabel: label, nth: i });
  return { ok: true, detail: `${dir > 0 ? 'plus' : 'minus'}#${i}` };
}

async function actionOpenSwapSheet(page, rand) {
  const openers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="button"], button'))
      .map((el, index) => ({ index, text: (el.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => /Swap or add|Add something/.test(x.text))
  );
  if (!openers.length) return { ok: false, detail: 'no swap sheet opener' };
  const pick = openers[Math.floor(rand() * openers.length)];
  await page.evaluate((nth) => {
    const els = Array.from(document.querySelectorAll('[role="button"], button')).filter((el) =>
      /Swap or add|Add something/.test((el.textContent || '').replace(/\s+/g, ' ').trim())
    );
    const el = els[nth];
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }, openers.indexOf(pick));
  await settle(page, 1000);

  const choices = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('[role="button"], button')).map((el) =>
      (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()
    );
    return {
      swap: labels.map((t, i) => (/^Swap$/.test(t) ? i : -1)).filter((i) => i >= 0),
      addInc: labels.map((t, i) => (/Add · included/.test(t) ? i : -1)).filter((i) => i >= 0),
      addPaid: labels.map((t, i) => (/Add · \+/.test(t) ? i : -1)).filter((i) => i >= 0),
      labels,
    };
  });

  let detail = 'opened';
  const clickLabelIndex = async (i) => {
    await page.evaluate((idx) => {
      const els = Array.from(document.querySelectorAll('[role="button"], button'));
      const el = els[idx];
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    }, i);
  };

  if (choices.swap.length && rand() < 0.55) {
    const j = Math.floor(rand() * choices.swap.length);
    await clickLabelIndex(choices.swap[j]);
    detail = `swap#${j}`;
  } else if (choices.addInc.length && rand() < 0.5) {
    const j = Math.floor(rand() * choices.addInc.length);
    await clickLabelIndex(choices.addInc[j]);
    detail = `add-included#${j}`;
  } else if (choices.addPaid.length) {
    const j = Math.floor(rand() * choices.addPaid.length);
    await clickLabelIndex(choices.addPaid[j]);
    detail = `add-paid#${j}`;
  }
  await page.keyboard.press('Escape').catch(() => {});
  return { ok: true, detail };
}

async function main() {
  const storage = storagePath('mybox-fuzz');
  const baselineRaw = readFixture('mybox-fuzz-baseline');
  if (!storage || !baselineRaw) {
    console.error('Run scripts/flows/mybox-seed.mjs first.');
    process.exit(2);
  }
  const baseline = JSON.parse(baselineRaw);
  const email = baseline.email || 'joseph+test-mybox@unaffiliated.co';
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('Run `npx firebase-tools login` first.');

  fs.mkdirSync(OUT, { recursive: true });
  const rand = mulberry32(SEED);
  const log = [];
  let failures = 0;

  const { browser, page } = await launch({
    device: PHONE,
    storageState: storage,
    extraInit: () => {
      try {
        window.localStorage.setItem('grapejuice-box-fuzz', '1');
      } catch {}
    },
  });

  // Start from a known-good baseline.
  let audit = await softReset(page, db, baseline, email);
  if (!audit) throw new Error('No __boxAudit after reset');
  if (audit.open?.length) {
    console.warn('baseline already open:', audit.open.map((p) => p.detail));
  }
  log.push({ step: 0, action: 'reset', totalCents: audit.totalCents, open: audit.open.length });

  const actions = [
    { name: 'donate', run: (p, r) => actionDonate(p, r), weight: 2 },
    { name: 'undo-donate', run: (p, r) => actionUndoDonate(p, r), weight: 2 },
    { name: 'plus', run: (p, r) => actionQty(p, r, 1), weight: 2 },
    { name: 'minus', run: (p, r) => actionQty(p, r, -1), weight: 2 },
    { name: 'swap-sheet', run: (p, r) => actionOpenSwapSheet(p, r), weight: 3 },
  ];
  const weighted = actions.flatMap((a) => Array(a.weight).fill(a));

  for (let step = 1; step <= STEPS; step++) {
    const action = pick(rand, weighted);
    const beforeAt = audit?.at;
    let result = { ok: false, detail: 'skip' };
    try {
      result = await action.run(page, rand);
    } catch (err) {
      result = { ok: false, detail: String(err?.message || err) };
    }
    await settle(page, 1200);
    audit = (await waitAudit(page, beforeAt)) || audit;

    const entry = {
      step,
      action: action.name,
      detail: result.detail,
      applied: result.ok,
      totalCents: audit?.totalCents ?? null,
      lines: audit?.lineItems?.length ?? null,
      open: audit?.open?.length ?? null,
      problems: (audit?.open || []).map((p) => ({ code: p.code, section: p.section, detail: p.detail })),
    };
    log.push(entry);
    process.stdout.write(
      `#${step} ${action.name} ${result.ok ? result.detail : `(skip ${result.detail})`} → $${((audit?.totalCents ?? 0) / 100).toFixed(2)} lines=${entry.lines} open=${entry.open}\n`
    );

    if (audit?.open?.length) {
      failures += 1;
      const dir = path.join(OUT, `fail-${String(step).padStart(3, '0')}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'repro.json'), JSON.stringify({ seed: SEED, entry, log: log.slice(-12), lines: audit.lineItems, audit: audit.audit }, null, 2));
      await screenshot(page, dir, 'screen');
      console.warn(`FAIL step ${step}: ${entry.problems.map((p) => p.detail).join('; ')}`);
      audit = await softReset(page, db, baseline, email);
      log.push({ step, action: 'soft-reset', totalCents: audit?.totalCents, open: audit?.open?.length });
    }
  }

  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ seed: SEED, steps: STEPS, failures, log }, null, 2));
  await browser.close();
  console.log(`\nDone. ${failures} failure(s) over ${STEPS} steps. Log: ${OUT}/log.json`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
