/**
 * Build a guest box through onboarding and save the guest session as a fixture, so
 * other flows and the desktop screenshots can start with a box already in place.
 *
 *   node scripts/flows/guest-box.mjs [fixtureName=guest-session] [--phone]
 */
import { launch, settle, writeFixture, saveStorage, screenshot, TEST_EMAIL, BASE_URL, DESKTOP, PHONE } from './lib.mjs';
const DEBUG_DIR = process.env.GJ_FLOW_SHOTS || '';
const snap = (page, n) => (DEBUG_DIR ? screenshot(page, DEBUG_DIR, n) : Promise.resolve());

const name = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'guest-session';
const phone = process.argv.includes('--phone');

async function moveSlider(page, label, fraction) {
  const slider = page.getByRole('slider', { name: label });
  await slider.waitFor();
  const box = await slider.boundingBox();
  if (!box) throw new Error(`slider "${label}" has no box`);
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}

async function main() {
  const { browser, context, page } = await launch({ device: phone ? PHONE : DESKTOP });
  await page.goto(`${BASE_URL}/box`, { waitUntil: 'load' });
  await settle(page, 2500);

  // Family step: one adult, one kid aged 5.
  const names = page.getByPlaceholder('Name');
  await names.first().waitFor();
  const count = await names.count();
  await names.nth(0).fill('Test Parent');
  if (count > 1) await names.nth(1).fill('Sam');
  const age5 = page.getByText('5', { exact: true }).first();
  if (await age5.isVisible().catch(() => false)) await age5.click();
  await snap(page, '1-family');
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await settle(page, 1500);
  await snap(page, '2-details');

  // Details step: both sliders must move before Continue enables.
  await moveSlider(page, 'How has Hanukkah looked in recent years?', 0.7);
  await moveSlider(page, 'How often do you do Jewish stuff?', 0.35);
  await snap(page, '3-details-set');
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await settle(page, 1500);
  await snap(page, '4-after-details');

  // Reveal: email gate, then My Box.
  const email = page.getByPlaceholder('Email');
  await email.waitFor({ timeout: 60_000 });
  await email.fill(TEST_EMAIL(phone ? 'phone' : 'desktop'));
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await settle(page, 1500);
  await snap(page, '5-after-email');
  await page.locator('[data-testid="box-order-summary-float"]').waitFor({ timeout: 90_000 });
  await settle(page, 2000);
  await snap(page, '6-mybox');

  await settle(page, 4000);
  const stored = await saveStorage(context, name);
  console.log(`storage state: ${stored}`);
  const session = await page.evaluate(() => window.localStorage.getItem('grapejuice-guest-session'));
  if (!session) throw new Error('guest session not found in localStorage');
  writeFixture(name, session);
  console.log(`fixture ${name}: saved`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
