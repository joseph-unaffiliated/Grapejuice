/**
 * Phone screenshots of the exported build with the mobile layouts forced on.
 *
 *   node scripts/flows/mobile-shots.mjs <outDir> name=path [name=path ...] [--guest] [--tall]
 *
 * Each path gets `?mbx=new` (or `&mbx=new`). `--guest` loads the guest box fixture from
 * guest-box.mjs so My Box and checkout have a box. `--tall` captures a 390x2400 viewport
 * so a whole page fits in one image. `name=path#click:Text` taps a button after load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, settle, storagePath, BASE_URL, PHONE } from './lib.mjs';

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.includes('=') && !a.startsWith('--')) || 'tmp/mobile-shots');
const guest = args.includes('--guest');
const tall = args.includes('--tall');
const shots = args.filter((a) => a.includes('='));

fs.mkdirSync(outDir, { recursive: true });
const device = tall ? { ...PHONE, viewport: { width: 390, height: 2400 } } : PHONE;
const { browser, page } = await launch({ device, storageState: guest ? storagePath('guest-session') : null });
for (const spec of shots) {
  const [name, rest] = spec.split('=');
  const [p, action] = rest.split('#');
  const url = `${BASE_URL}${p}${p.includes('?') ? '&' : '?'}mbx=new`;
  await page.goto(url, { waitUntil: 'load' });
  await settle(page, 3500);
  if (action?.startsWith('click:')) {
    const label = action.slice(6);
    // RN Web Pressables answer to taps; the sticky header keeps a hidden clone, so take the last match.
    const target = page.getByRole('button', { name: label });
    if (await target.count()) await target.last().tap({ force: true, timeout: 8000 });
    else await page.getByText(label, { exact: false }).last().tap({ force: true });
    await settle(page, 1500);
  }
  if (action?.startsWith('scroll:')) {
    await page.evaluate((y) => window.scrollTo(0, y), Number(action.slice(7)));
    await settle(page, 800);
  }
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`ok   ${name}`);
}
await browser.close();
