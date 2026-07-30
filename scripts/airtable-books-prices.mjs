#!/usr/bin/env node
/**
 * Build / apply Hanukkah Books price + primary-image alignment.
 *
 * Reads "Price (approx, USD)" and sets Cost per Unit = Member Price =
 * Non-Member Price = high end of that text. Also lists Cover Image (AI)
 * counts (books’ primary attachment field).
 *
 * Usage:
 *   AIRTABLE_PAT=pat... node scripts/airtable-books-prices.mjs           # dry-run CSV
 *   AIRTABLE_PAT=pat... node scripts/airtable-books-prices.mjs --apply # write (needs record write + currency fields on table)
 *
 * Token needs data.records:read (and :write for --apply). To create the
 * Cost / Member / Non-Member columns on Hanukkah Books, also need
 * schema.bases:write — or add them manually in Airtable first.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.AIRTABLE_BASE_ID || 'appQscrPCQUIj4shh';
const BOOKS = 'tbleo48j2H34DRAu1';
const PRICE_FIELD = 'Price (approx, USD)';
const COVER_FIELD = 'Cover Image (AI)';
const COST = 'Cost per Unit';
const MEMBER = 'Member Price';
const NON_MEMBER = 'Non-Member Price';

function parseApproxPriceHighCents(raw) {
  const s = String(raw ?? '');
  const amounts = [];
  const re = /~?\$?\s*(\d+(?:\.\d{1,2})?)/g;
  let m;
  while ((m = re.exec(s))) {
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 500) continue;
    amounts.push(n);
  }
  if (!amounts.length) return 0;
  return Math.round(Math.max(...amounts) * 100);
}

async function airtable(pat, urlPath, init = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${urlPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Airtable ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function listAllBooks(pat) {
  const out = [];
  let offset;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    q.append('fields[]', 'Title');
    q.append('fields[]', PRICE_FIELD);
    q.append('fields[]', COVER_FIELD);
    q.append('fields[]', 'Cut?');
    if (offset) q.set('offset', offset);
    const page = await airtable(pat, `${BASE}/${BOOKS}?${q}`);
    out.push(...(page.records || []));
    offset = page.offset;
  } while (offset);
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  let pat = process.env.AIRTABLE_PAT?.trim();
  if (!pat) {
    const keyPath = path.resolve(
      __dirname,
      '../../../Keys/airtable_grapejuice-inventorymgmt.txt'
    );
    if (fs.existsSync(keyPath)) pat = fs.readFileSync(keyPath, 'utf8').trim();
  }
  if (!pat) {
    console.error('Set AIRTABLE_PAT');
    process.exit(1);
  }

  const records = await listAllBooks(pat);
  const rows = [];
  for (const rec of records) {
    if (rec.fields['Cut?'] === true) continue;
    const title = String(rec.fields.Title || '').trim();
    if (!title) continue;
    const raw = rec.fields[PRICE_FIELD];
    const cents = parseApproxPriceHighCents(raw);
    const dollars = cents / 100;
    const coverCount = (rec.fields[COVER_FIELD] || []).length;
    rows.push({
      id: rec.id,
      title,
      priceRaw: raw || '',
      dollars,
      coverCount,
    });
  }

  const outDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'hanukkah-books-prices.csv');
  const csv = [
    ['Record ID', 'Title', PRICE_FIELD, COST, MEMBER, NON_MEMBER, 'Cover Image count'].join(','),
    ...rows.map((r) =>
      [
        r.id,
        JSON.stringify(r.title),
        JSON.stringify(String(r.priceRaw)),
        r.dollars.toFixed(2),
        r.dollars.toFixed(2),
        r.dollars.toFixed(2),
        String(r.coverCount),
      ].join(',')
    ),
  ].join('\n');
  fs.writeFileSync(csvPath, csv);
  console.log(`Wrote ${rows.length} rows → ${csvPath}`);
  console.log(
    `With cover: ${rows.filter((r) => r.coverCount > 0).length}; missing price: ${rows.filter((r) => r.dollars === 0).length}`
  );

  if (!apply) {
    console.log('Dry run only. Re-run with --apply after adding currency fields + write-scoped PAT.');
    return;
  }

  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const payload = {
      records: chunk.map((r) => ({
        id: r.id,
        fields: {
          [COST]: r.dollars,
          [MEMBER]: r.dollars,
          [NON_MEMBER]: r.dollars,
        },
      })),
    };
    try {
      await airtable(pat, `${BASE}/${BOOKS}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      console.log(`Patched ${i + chunk.length}/${rows.length}`);
    } catch (e) {
      console.error(e.message);
      console.error(
        'If fields are missing, create Cost per Unit / Member Price / Non-Member Price (currency) on Hanukkah Books, then retry.'
      );
      process.exit(1);
    }
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
