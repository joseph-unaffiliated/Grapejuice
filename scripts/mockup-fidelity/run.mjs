/**
 * Side-by-side captures of the approved phone mockups and the app.
 *
 *   node scripts/mockup-fidelity/run.mjs [--only id,id] [--base http://localhost:8081] [--out tmp/fidelity/latest] [--screens 3]
 *
 * For each pair in pairs.mjs it loads the mockup (design/mobile-mockups, ?ig=0&shot=1) and
 * the app route (?mbx=new) at 390x844, scrolls both page scrollers one screen at a time and
 * writes, per screen step, `<id>-<n>.png`: mockup on the left, app on the right. Raw captures
 * go in `raw/`. Open `index.html` in the out dir to see every pair.
 *
 * Default base is the Expo web dev server (npx expo start --web --port 8081), so edits show
 * up on the next run without a build. Use --base https://grapejuice.co to audit production.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PAIRS } from './pairs.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const only = arg('only') ? new Set(arg('only').split(',')) : null;
const base = arg('base', process.env.GJ_BASE_URL || 'http://localhost:8081').replace(/\/$/, '');
const outDir = path.resolve(arg('out', 'tmp/fidelity/latest'));
const maxSteps = Number(arg('screens', 7));
const mockDir = path.resolve('design/mobile-mockups');
const fixtureFile = (name) => path.resolve(`scripts/flows/fixtures/${name}.storage.json`);

const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.0.0',
  reducedMotion: 'reduce',
  timezoneId: 'America/New_York',
  locale: 'en-US',
};
const STEP = 724;
const STABLE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
#onetrust-consent-sdk,.ot-floating-button,#ot-sdk-btn-floating,[data-testid="gj-admin-fab"],[aria-label="Admin controls"]{display:none!important}`;

/**
 * Fixtures were saved on one origin; move them to the audited one. `mockup-guest` is a draft
 * box for Sam (scripts/flows/guest-box.mjs); `mockup-member` is that box signed in to a
 * joseph+test account (scripts/flows/member-box.mjs).
 */
function fixtureState(name) {
  if (!fs.existsSync(fixtureFile(name))) return null;
  const s = JSON.parse(fs.readFileSync(fixtureFile(name), 'utf8'));
  const u = new URL(base);
  return {
    cookies: s.cookies.filter((c) => /^(127\.0\.0\.1|localhost)$/.test(c.domain)).map((c) => ({ ...c, domain: u.hostname })),
    origins: s.origins.map((o) => ({ ...o, origin: u.origin })),
  };
}

/** Scroll the page's main scroller (the app scrolls inside a div, the mockups scroll the document). */
async function scrollTo(page, y) {
  return page.evaluate((y) => {
    const els = [...document.querySelectorAll('*')].filter((n) => {
      const cs = getComputedStyle(n);
      return n.scrollHeight > n.clientHeight + 40 && n.clientHeight > 500 && /(auto|scroll)/.test(cs.overflowY);
    });
    const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el) {
      el.scrollTop = y;
      return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
    }
    window.scrollTo(0, y);
    return { top: window.scrollY, max: document.documentElement.scrollHeight - innerHeight };
  }, y);
}

async function tapByName(page, name, first = false) {
  const pick = (l) => (first ? l.first() : l.last());
  const t = page.getByRole('button', { name });
  if (await t.count()) await pick(t).tap({ force: true }).catch(() => {});
  else await pick(page.getByText(name)).tap({ force: true }).catch(() => {});
}

/** `steps`: `{ click }` taps by accessible name or text, `{ fill: [label, value] }` types into a field, `{ wait }` pauses. */
async function runSteps(page, steps) {
  for (const st of steps) {
    if (st.click) await tapByName(page, st.click, st.first);
    if (st.fill) await page.getByLabel(st.fill[0], { exact: true }).last().fill(st.fill[1], { force: true }).catch(() => {});
    await page.waitForTimeout(st.wait ?? 1200);
  }
}

async function capture(browser, url, { storageState, click, steps, firstOnly, label }) {
  const context = await browser.newContext({ ...PHONE, ...(storageState ? { storageState } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(url, { waitUntil: 'load' }).catch(() => {});
  await page.addStyleTag({ content: STABLE }).catch(() => {});
  await page.waitForTimeout(label === 'app' ? 4500 : 1500);
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
  if (click) {
    await tapByName(page, click);
    await page.waitForTimeout(2500);
  }
  if (steps) await runSteps(page, steps);
  const shots = [];
  for (let i = 0; i < (firstOnly ? 1 : maxSteps); i++) {
    const pos = await scrollTo(page, i * STEP);
    if (i > 0 && pos.top < i * STEP - STEP + 10) break;
    await page.waitForTimeout(500);
    shots.push(await page.screenshot());
    if (pos.top >= pos.max) break;
  }
  await context.close();
  return shots;
}

function compositeHtml(id, n, left, right) {
  const img = (b, cap) =>
    `<figure><figcaption>${cap}</figcaption>${b ? `<img src="data:image/png;base64,${b.toString('base64')}">` : '<div class="none">—</div>'}</figure>`;
  return `<html><body style="margin:0;background:#ddd;font:13px system-ui;display:flex;gap:12px;padding:10px">
  <style>figure{margin:0}figcaption{padding:0 0 6px}img,.none{width:390px;height:844px;display:block;background:#fff}</style>
  ${img(left, `MOCKUP · ${id} · screen ${n}`)}${img(right, `APP · ${id} · screen ${n}`)}</body></html>`;
}

async function main() {
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  const browser = await chromium.launch();
  const states = { guest: fixtureState('mockup-guest'), member: fixtureState('mockup-member') };
  const cards = [];
  for (const pair of PAIRS) {
    if (only && !only.has(pair.id)) continue;
    const [file, query] = pair.mockup.split('?');
    const mockUrl = `${pathToFileURL(path.join(mockDir, file)).href}?${query ? `${query}&` : ''}ig=0&shot=1`;
    const appUrl = `${base}${pair.app}${pair.app.includes('?') ? '&' : '?'}mbx=new`;
    const [mock, app] = await Promise.all([
      capture(browser, mockUrl, { firstOnly: pair.firstOnly, label: 'mock' }),
      capture(browser, appUrl, {
        storageState: pair.member ? states.member : pair.guest ? states.guest : null,
        click: pair.click,
        steps: pair.steps,
        firstOnly: pair.firstOnly,
        label: 'app',
      }),
    ]);
    const steps = Math.max(mock.length, app.length);
    const comp = await browser.newPage({ viewport: { width: 830, height: 890 } });
    for (let i = 0; i < steps; i++) {
      if (mock[i]) fs.writeFileSync(path.join(outDir, 'raw', `${pair.id}-${i + 1}-mockup.png`), mock[i]);
      if (app[i]) fs.writeFileSync(path.join(outDir, 'raw', `${pair.id}-${i + 1}-app.png`), app[i]);
      await comp.setContent(compositeHtml(pair.id, i + 1, mock[i], app[i]));
      const file = `${pair.id}-${i + 1}.png`;
      await comp.screenshot({ path: path.join(outDir, file) });
      cards.push(file);
    }
    await comp.close();
    console.log(`ok   ${pair.id}  (${mock.length} mockup / ${app.length} app screens)`);
  }
  await browser.close();
  const prev = fs.existsSync(path.join(outDir, 'index.html')) ? fs.readFileSync(path.join(outDir, 'index.html'), 'utf8') : '';
  const all = [...new Set([...(prev.match(/src="([^"]+\.png)"/g) || []).map((s) => s.slice(5, -1)), ...cards])].sort();
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    `<html><body style="background:#eee;font:14px system-ui">${all.map((f) => `<div><img src="${f}" loading="lazy"></div>`).join('')}</body></html>`
  );
  console.log(`\n${cards.length} composites in ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
