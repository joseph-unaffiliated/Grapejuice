/**
 * Reallocate the live Grapejuice campaigns.
 * Read-only unless --apply is passed.
 * Does not print the access token.
 *
 *   node scripts/program-meta.mjs
 *   node scripts/program-meta.mjs --apply
 */
import { readFileSync } from 'node:fs';

const ACCOUNT = 'act_1311852520406314';
const BROAD = '120247675198020519';
const FOLLOW_UP = '120247895235230519';
const GRANDPARENT = '120247861812310519';
const PURCHASERS = '120247797137350519';
const GRAPH = 'https://graph.facebook.com/v21.0';
const APPLY = process.argv.includes('--apply');
const TOKEN = readFileSync(
  '/Users/joseph/Dropbox/Unaffiliated/Data Configuration/Keys/META_ADS_ACCESS_TOKEN_ADSMANAGEMENT.txt',
  'utf8'
).trim();

async function graph(path, params = {}, method = 'GET') {
  const body = new URLSearchParams({ access_token: TOKEN });
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === 'GET' ? undefined : { method, body });
  const json = await res.json();
  if (json.error) throw new Error(`${method} ${path}: ${json.error.message}`);
  return json;
}

const campaign = await graph(BROAD, { fields: 'name,daily_budget,effective_status,bid_strategy' });
const follow = await graph(FOLLOW_UP, { fields: 'name,daily_budget,effective_status' });
const grand = await graph(GRANDPARENT, { fields: 'name,effective_status' });
console.log(JSON.stringify({ campaign, follow, grand, apply: APPLY }, null, 2));

const adsets = await graph(`${BROAD}/adsets`, {
  fields: 'id,name,effective_status,daily_budget',
  limit: '100',
});
const insights = await graph(`${BROAD}/insights`, {
  level: 'adset',
  fields: 'adset_id,adset_name,spend,actions',
  date_preset: 'last_14d',
  limit: '100',
});
const byId = new Map((insights.data ?? []).map((row) => [row.adset_id, row]));
const ranked = (adsets.data ?? [])
  .filter((s) => s.effective_status === 'ACTIVE')
  .map((s) => {
    const row = byId.get(s.id);
    const purchases = Number((row?.actions ?? []).find((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value ?? 0);
    const spend = Number(row?.spend ?? 0);
    return { id: s.id, name: s.name, spend, purchases, cpp: purchases ? spend / purchases : Infinity };
  })
  .sort((a, b) => a.cpp - b.cpp || b.purchases - a.purchases);
console.log(JSON.stringify(ranked.map((r) => ({ ...r, cpp: Number.isFinite(r.cpp) ? Math.round(r.cpp) : null })), null, 2));

const keep = new Set(ranked.slice(0, 3).map((r) => r.id));
const pause = ranked.filter((r) => !keep.has(r.id));

if (!APPLY) {
  console.log(JSON.stringify({ wouldKeep: [...keep], wouldPause: pause.map((p) => p.name), broadBudget: 25000 }, null, 2));
  process.exit(0);
}

const existingRules = await graph(`${ACCOUNT}/adrules_library`, { fields: 'id,name,status', limit: '50' }).catch((err) => ({ error: String(err.message || err) }));
console.log(JSON.stringify({ existingRules }, null, 2));

await graph(BROAD, { daily_budget: '25000' }, 'POST');
for (const row of pause) {
  await graph(row.id, { status: 'PAUSED' }, 'POST');
}

const audiences = await graph(`${ACCOUNT}/customaudiences`, { fields: 'id,name,subtype', limit: '200' });
const names = new Set((audiences.data ?? []).map((a) => a.name));
let networkId = (audiences.data ?? []).find((a) => a.name === 'Grapejuice network readers')?.id ?? null;
if (!networkId) {
  const made = await graph(`${ACCOUNT}/customaudiences`, {
    name: 'Grapejuice network readers',
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
    description: 'Unaffiliated newsletter readers (JBrand, 90s Parent, Parenting Weakly). Purchasers stay excluded at the ad set.',
  }, 'POST');
  networkId = made.id;
}
let lookalikeId = (audiences.data ?? []).find((a) => a.name === 'Grapejuice purchasers 1%')?.id ?? null;
if (!lookalikeId && !names.has('Grapejuice purchasers 1%')) {
  try {
    const made = await graph(`${ACCOUNT}/customaudiences`, {
      name: 'Grapejuice purchasers 1%',
      subtype: 'LOOKALIKE',
      origin_audience_id: PURCHASERS,
      lookalike_spec: JSON.stringify({ type: 'similarity', ratio: 0.01, country: 'US' }),
    }, 'POST');
    lookalikeId = made.id;
  } catch (err) {
    console.log(JSON.stringify({ lookalike: String(err.message || err) }));
  }
}

const rule = {
  created: false,
  reason: 'Not posted from here. A schedule rule with only an entity filter would pause every ad set. Create it in Ads Manager: hourly, pause an ad set when frequency is over 3 or cost per purchase is over $150 across the last 4 days with at least $300 spent.',
};

console.log(JSON.stringify({
  broadBudget: 25000,
  paused: pause.map((p) => p.name),
  kept: ranked.filter((r) => keep.has(r.id)).map((r) => r.name),
  networkId,
  lookalikeId,
  rule,
  followUpUnchanged: FOLLOW_UP,
  grandparentStaysPaused: GRANDPARENT,
}, null, 2));
