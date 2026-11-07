/**
 * Monday Nov 9, 11:00am ET: pause every Grapejuice campaign and turn off the
 * overnight pause/resume rules so nothing comes back on Tuesday.
 */

import * as logger from './logger';
import { etDate } from './program/time';

const GRAPH = 'https://graph.facebook.com/v21.0';
const ACCOUNT = 'act_1311852520406314';
const CUTOFF_DAY = '2026-11-09';

async function graph(token: string, path: string, params: Record<string, string> = {}, method = 'GET') {
  const body = new URLSearchParams({ access_token: token });
  for (const [key, value] of Object.entries(params)) body.set(key, value);
  const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === 'GET' ? undefined : { method, body });
  const json = (await res.json()) as { error?: { message?: string }; data?: Array<Record<string, string>> };
  if (json.error) throw new Error(json.error.message || 'Meta request failed');
  return json;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function stopGrapejuiceAds(now = new Date()): Promise<{ paused: string[]; rules: string[] }> {
  if (etDate(now.toISOString()) !== CUTOFF_DAY) return { paused: [], rules: [] };
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('META_ADS_ACCESS_TOKEN is not configured');

  const campaigns = await graph(token, `${ACCOUNT}/campaigns`, { fields: 'name,effective_status', limit: '100' });
  const paused: string[] = [];
  for (const campaign of campaigns.data ?? []) {
    if (!campaign.name?.startsWith('Grapejuice')) continue;
    if (campaign.effective_status === 'PAUSED') continue;
    await sleep(32000);
    await graph(token, campaign.id, { status: 'PAUSED' }, 'POST');
    paused.push(campaign.name);
  }

  const rules = await graph(token, `${ACCOUNT}/adrules_library`, { fields: 'name,status', limit: '100' });
  const stopped: string[] = [];
  for (const rule of rules.data ?? []) {
    if (!rule.name?.startsWith('Grapejuice:')) continue;
    if (rule.status === 'DISABLED') continue;
    await sleep(32000);
    await graph(token, rule.id, { status: 'DISABLED' }, 'POST');
    stopped.push(rule.name);
  }
  logger.info('grapejuice ads stopped for the season', { paused, rules: stopped });
  return { paused, rules: stopped };
}
