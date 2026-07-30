#!/usr/bin/env node
/**
 * Copy Full Catalog Category=Book Primary Image renderings onto Hanukkah Books
 * Primary Image (matched by title slug). Existing HB primaries move into Other Images.
 *
 * Usage:
 *   node scripts/airtable-books-use-fc-renderings.mjs           # dry-run
 *   node scripts/airtable-books-use-fc-renderings.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, 'functions/.env.grapejuice-pilot');
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

const env = loadEnv();
const PAT = process.env.AIRTABLE_PAT || env.AIRTABLE_PAT;
const BASE = process.env.AIRTABLE_BASE_ID || env.AIRTABLE_BASE_ID || 'appQscrPCQUIj4shh';
const FC = 'tblCUCVfohWTQy8fP';
const BOOKS = 'tbleo48j2H34DRAu1';
const B = {
  primaryImage: 'fldPIYO00g9QwhpVC',
  otherImages: 'fldlxFU6PXF2LWutu',
};

if (!PAT) {
  console.error('AIRTABLE_PAT required');
  process.exit(1);
}

function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'item';
}

function renderingSlug(filename) {
  if (!filename) return null;
  const base = filename.replace(/\.[^.]+$/, '').replace(/__primary$/i, '');
  const s = slugify(base);
  return s === 'item' ? null : s;
}

async function airtable(urlPath, init = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${urlPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

async function listAll(tableId, fields) {
  const out = [];
  let offset;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    for (const f of fields) q.append('fields[]', f);
    if (offset) q.set('offset', offset);
    const page = await airtable(`${BASE}/${tableId}?${q}`);
    out.push(...(page.records || []));
    offset = page.offset;
  } while (offset);
  return out;
}

function findRendering(title, index) {
  const slug = slugify(title);
  if (index.has(slug)) return index.get(slug);
  let bestKey = null;
  let bestScore = 0;
  for (const key of index.keys()) {
    if (key.length < 8 || slug.length < 8) continue;
    let score = 0;
    if (slug.startsWith(key) || key.startsWith(slug)) score = Math.min(key.length, slug.length);
    else if (slug.includes(key) || key.includes(slug)) score = Math.min(key.length, slug.length) - 1;
    if (score >= 12 && score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey ? index.get(bestKey) : null;
}

const apply = process.argv.includes('--apply');

const [fcRecs, bookRecs] = await Promise.all([
  listAll(FC, ['ID', 'Category', 'Primary Image', 'Other Images']),
  listAll(BOOKS, ['Title', 'Primary Image', 'Other Images', 'Cut?']),
]);

const index = new Map();
for (const rec of fcRecs) {
  const catField = rec.fields.Category;
  const catNames = Array.isArray(catField)
    ? catField.map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean)
    : [];
  if (!catNames.map((c) => c.toLowerCase()).includes('book')) continue;
  const primary = rec.fields['Primary Image'] || [];
  if (!primary.length) continue;
  const rendering = { primary, other: rec.fields['Other Images'] || [] };
  const keys = new Set();
  const name = String(rec.fields.ID || '').trim();
  if (name) keys.add(slugify(name));
  for (const att of primary) {
    const s = renderingSlug(att.filename);
    if (s) keys.add(s);
  }
  for (const k of keys) index.set(k, rendering);
}

console.log(`Indexed ${index.size} Full Catalog book renderings`);

const updates = [];
let matched = 0;
let skippedCut = 0;
let noMatch = 0;
let already = 0;
for (const rec of bookRecs) {
  if (rec.fields['Cut?'] === true) {
    skippedCut += 1;
    continue;
  }
  const title = String(rec.fields.Title || '').trim();
  if (!title) continue;
  const fc = findRendering(title, index);
  if (!fc?.primary?.length) {
    noMatch += 1;
    continue;
  }
  matched += 1;
  const existingPrimary = rec.fields['Primary Image'] || [];
  const existingOther = rec.fields['Other Images'] || [];
  const newFn = fc.primary[0]?.filename;
  if (existingPrimary[0]?.filename === newFn) {
    already += 1;
    continue;
  }

  const other = [];
  for (const att of [...existingOther, ...existingPrimary]) {
    if (!att?.url) continue;
    if (att.filename === newFn) continue;
    if (other.some((o) => o.filename === att.filename)) continue;
    other.push({ url: att.url, filename: att.filename });
  }

  updates.push({
    id: rec.id,
    fields: {
      [B.primaryImage]: fc.primary.map((a) => ({ url: a.url, filename: a.filename })),
      [B.otherImages]: other,
    },
    title,
    newFn,
  });
}

console.log({ matched, already, noMatch, skippedCut, toUpdate: updates.length, apply });
if (!apply) {
  console.log(
    'Sample:',
    updates.slice(0, 8).map((u) => ({ title: u.title, newFn: u.newFn }))
  );
  console.log('Re-run with --apply to write.');
  process.exit(0);
}

for (let i = 0; i < updates.length; i += 10) {
  const chunk = updates.slice(i, i + 10).map(({ id, fields }) => ({ id, fields }));
  await airtable(`${BASE}/${BOOKS}`, {
    method: 'PATCH',
    body: JSON.stringify({ records: chunk, typecast: true }),
  });
  console.log(`Updated ${Math.min(i + chunk.length, updates.length)}/${updates.length}`);
}
console.log('Done');
