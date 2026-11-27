#!/usr/bin/env node
/**
 * Shop campaign audience swap.
 *
 *   node scripts/meta-attach-shop-lookalikes.mjs --open     Remove every custom audience from the
 *                                                           active shop ad sets (open targeting,
 *                                                           purchaser exclusion kept), then exit.
 *   node scripts/meta-attach-shop-lookalikes.mjs --wait     Check once an hour. When BOTH 5%
 *                                                           lookalikes are ready, set them as the
 *                                                           only custom audiences on the active
 *                                                           shop ad sets, verify, then exit
 *                                                           (that exit is the "terminate").
 *
 * Tokens come from the Keys folder and are never printed.
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const KEYS = '/Users/joseph/Dropbox/Unaffiliated/Data Configuration/Keys';
const read = readFileSync(`${KEYS}/META_ADS_ACCESS_TOKEN.txt`, 'utf8').trim();
const write = readFileSync(`${KEYS}/META_ADS_ACCESS_TOKEN_ADSMANAGEMENT.txt`, 'utf8').trim();

const GRAPH = 'https://graph.facebook.com/v21.0';
const ACCOUNT = 'act_1311852520406314';
const CAMPAIGN = '120248281015360519'; // Grapejuice Co - Shop
const LOOKALIKES = [
  { id: '120248629138110519', name: '5% - Follow-up list' },
  { id: '120248629144430519', name: '5% - Ad clickers' },
];
const CHECK_EVERY_MS = 60 * 60 * 1000;
const MAX_CHECKS = 72; // three days, then stop and leave the ad sets open
const LOG = '/tmp/meta-attach-lookalikes.log';
const DONE = '/tmp/meta-attach-lookalikes.done';

const log = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
};

async function graph(path, { method = 'GET', params = {}, token = read } = {}) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === 'GET' ? undefined : { method, body });
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.message}`);
  return json;
}

async function activeShopAdSets() {
  const { data } = await graph(`${CAMPAIGN}/adsets`, { params: { fields: 'name,status,targeting', limit: '100' } });
  return data.filter((a) => a.status === 'ACTIVE' && a.name.startsWith('Shop - '));
}

async function setCustomAudiences(adset, ids) {
  const targeting = { ...adset.targeting };
  if (ids.length) targeting.custom_audiences = ids.map((id) => ({ id }));
  else delete targeting.custom_audiences;
  await graph(adset.id, { method: 'POST', token: write, params: { targeting: JSON.stringify(targeting) } });
}

async function verifyAndEstimate(expectedIds) {
  const sets = await activeShopAdSets();
  const bad = sets.filter((a) => {
    const have = (a.targeting.custom_audiences || []).map((c) => c.id).sort().join(',');
    return have !== [...expectedIds].sort().join(',');
  });
  const est = await graph(`${ACCOUNT}/delivery_estimate`, {
    params: { optimization_goal: 'OFFSITE_CONVERSIONS', targeting_spec: JSON.stringify(sets[0].targeting) },
  });
  const e = est.data?.[0];
  log(
    `verified ${sets.length} active shop ad sets, ${bad.length} mismatched; ` +
      `estimated audience ${e?.estimate_mau_lower_bound}-${e?.estimate_mau_upper_bound}`
  );
  return bad.length === 0;
}

async function openAudience() {
  const sets = await activeShopAdSets();
  for (const adset of sets) {
    await setCustomAudiences(adset, []);
    log(`opened ${adset.name}`);
  }
  const ok = await verifyAndEstimate([]);
  if (!ok) throw new Error('some ad sets still have custom audiences');
}

async function lookalikesReady() {
  let ready = true;
  for (const l of LOOKALIKES) {
    const a = await graph(l.id, { params: { fields: 'delivery_status,operation_status,approximate_count_lower_bound,approximate_count_upper_bound' } });
    const ok = a.delivery_status?.code === 200 && a.operation_status?.code === 200;
    log(
      `lookalike ${l.name}: ${ok ? 'READY' : 'not ready'} ` +
        `(delivery ${a.delivery_status?.code} "${a.delivery_status?.description}", operation ${a.operation_status?.code} "${a.operation_status?.description}", ` +
        `size ${a.approximate_count_lower_bound}-${a.approximate_count_upper_bound})`
    );
    if (!ok) ready = false;
  }
  return ready;
}

async function attach() {
  const ids = LOOKALIKES.map((l) => l.id);
  const sets = await activeShopAdSets();
  for (const adset of sets) {
    await setCustomAudiences(adset, ids);
    log(`attached lookalikes to ${adset.name}`);
  }
  const ok = await verifyAndEstimate(ids);
  if (!ok) throw new Error('verification failed after attach');
}

async function wait() {
  writeFileSync(`/tmp/meta-attach-lookalikes.pid`, String(process.pid));
  log(`checker started (pid ${process.pid}), checking every hour, up to ${MAX_CHECKS} checks`);
  for (let i = 1; i <= MAX_CHECKS; i++) {
    try {
      log(`check ${i}/${MAX_CHECKS}`);
      if (await lookalikesReady()) {
        await attach();
        writeFileSync(DONE, new Date().toISOString());
        log('DONE: lookalikes attached to the active shop ad sets. Checker exiting.');
        return;
      }
    } catch (err) {
      log(`check failed: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, CHECK_EVERY_MS));
  }
  log(`GAVE UP after ${MAX_CHECKS} checks; lookalikes never became ready. Ad sets left open.`);
}

const mode = process.argv[2];
if (mode === '--open') await openAudience();
else if (mode === '--wait') await wait();
else {
  console.log('usage: --open | --wait');
  process.exit(1);
}
process.exit(0);
