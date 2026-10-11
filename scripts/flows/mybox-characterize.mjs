/**
 * Characterize My Box behavior through the real UI: quantity up and down past the
 * included amount, donate and restore, and the running total after each step.
 *
 *   node scripts/flows/mybox-characterize.mjs record  tmp/flows/mybox-before.json
 *   node scripts/flows/mybox-characterize.mjs check   tmp/flows/mybox-before.json
 *
 * `record` writes the observed sequence; `check` runs the same steps and fails if
 * any observed value differs. Uses the guest fixture from guest-box.mjs. The box is
 * left as it was found (every change is undone).
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, settle, storagePath, readBoxTotalCents, screenshot, BASE_URL, DESKTOP, PHONE } from './lib.mjs';

const [mode, file] = process.argv.slice(2);
if (!mode || !file) {
  console.error('usage: mybox-characterize.mjs record|check <file> [--phone]');
  process.exit(2);
}
const phone = process.argv.includes('--phone');
const shotsDir = process.env.GJ_FLOW_SHOTS || '';

async function clickNear(page, name, label) {
  // Rows mount lazily, so bring the item on screen first.
  await page.getByText(name, { exact: false }).first().scrollIntoViewIfNeeded();
  await settle(page, 900);
  // Pick the button with this aria-label whose nearest enclosing block also contains the item name.
  const target = await page.evaluateHandle(
    ({ name, label }) => {
      const buttons = Array.from(document.querySelectorAll(`[aria-label="${label}"]`));
      let best = null;
      let bestDepth = Infinity;
      for (const btn of buttons) {
        let cur = btn;
        let depth = 0;
        while (cur && depth < 14) {
          if (cur.textContent && cur.textContent.includes(name)) break;
          cur = cur.parentElement;
          depth++;
        }
        if (cur && depth < bestDepth) {
          best = btn;
          bestDepth = depth;
        }
      }
      return best;
    },
    { name, label }
  );
  const element = await target.asElement();
  if (!element) throw new Error(`No "${label}" near "${name}"`);
  await element.scrollIntoViewIfNeeded();
  await element.click();
  await settle(page, 1800);
}

async function main() {
  const storage = storagePath('guest-session');
  if (!storage) throw new Error('Run scripts/flows/guest-box.mjs first');
  const { browser, page } = await launch({ device: phone ? PHONE : DESKTOP, storageState: storage });
  const observed = [];
  const note = async (step) => {
    const total = await readBoxTotalCents(page);
    const bar = (await page.locator('[data-testid="box-order-summary-float"]').innerText()).replace(/\s+/g, ' ').trim();
    observed.push({ step, totalCents: total, bar: bar.replace(/You.ll still be able.*$/, '').trim() });
    if (shotsDir) await screenshot(page, shotsDir, `${String(observed.length).padStart(2, '0')}-${step}`);
  };

  await page.goto(`${BASE_URL}/box`, { waitUntil: 'load' });
  await page.locator('[data-testid="box-order-summary-float"]').waitFor({ timeout: 60_000 });
  await settle(page, 2500);
  await note('start');

  // 1. Candles: one more unit (an extra unit is paid), then back down.
  await clickNear(page, 'Beeswax Candles', 'Increase quantity');
  await note('candles-plus');
  await clickNear(page, 'Beeswax Candles', 'Decrease quantity');
  await note('candles-minus');

  // 2. The kid's book: stepping it down donates it; restore from the Donated chip if it
  //    appears, otherwise by stepping the same row back up. Whatever happens is recorded.
  await clickNear(page, 'A Dragon for Hanukkah', 'Donate');
  await note('book-donated');
  const chip = page.getByRole('button', { name: /^Donated \$/ }).first();
  if (await chip.count()) {
    await chip.click();
    await settle(page, 1200);
    const dlg = page.getByRole('dialog').first();
    if (await dlg.count()) observed.push({ step: 'donated-list', text: (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 160) });
    const restore = page.getByRole('button', { name: /^Restore / }).first();
    if (await restore.count()) await restore.click();
    await settle(page, 1800);
    const close = page.getByRole('button', { name: /^(Done|Close donated items)$/ }).first();
    if (await close.count()) await close.click().catch(() => {});
    await settle(page, 1200);
  } else {
    observed.push({ step: 'donated-list', text: 'no Donated chip' });
    await clickNear(page, 'A Dragon for Hanukkah', 'Increase quantity');
  }
  await note('book-restored');

  // 3. Dreidel: the household count comes as ×N; one more is paid, then back.
  await clickNear(page, 'Classic Wooden Dreidel', 'Increase quantity');
  await note('dreidel-plus');
  await clickNear(page, 'Classic Wooden Dreidel', 'Decrease quantity');
  await note('dreidel-minus');

  await browser.close();

  const start = observed[0].bar;
  const end = observed.at(-1).bar;
  if (start !== end) console.warn(`warning: the bar changed from "${start}" to "${end}"; the box was not left as found`);

  if (mode === 'record') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(observed, null, 2));
    console.log(`recorded ${observed.length} observations to ${file}`);
    for (const o of observed) console.log(`  ${o.step}: ${o.bar ?? o.text}`);
    return;
  }
  const expected = JSON.parse(fs.readFileSync(file, 'utf8'));
  let failed = 0;
  for (let i = 0; i < Math.max(expected.length, observed.length); i++) {
    const e = JSON.stringify(expected[i]);
    const o = JSON.stringify(observed[i]);
    const same = e === o;
    if (!same) failed++;
    console.log(`${same ? 'same   ' : 'DIFF   '} ${expected[i]?.step ?? observed[i]?.step}  expected ${e}  got ${o}`);
  }
  console.log(failed ? `\n${failed} difference(s).` : '\nMy Box behaves the same.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
