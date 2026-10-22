/**
 * Hourly stand-in for the Ads Manager auto-pause rule. This ad account rejects automated rules
 * that pause on frequency or cost ("can't have cost conditions"), so the check lives here.
 * Pauses one ad set when, over the last 3 days, it was shown more than about 3 times a day
 * (frequency over 9) or it spent at least $300 at more than $150 per purchase.
 */
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';

const token = defineSecret('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
const ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
const GRANDPARENT = '120247861812310519';

type Row = {
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

export async function runMetaGuard(accessToken: string): Promise<{ checked: number; paused: string[] }> {
  const params = new URLSearchParams({
    access_token: accessToken,
    level: 'adset',
    date_preset: 'last_3d',
    fields: 'adset_id,adset_name,campaign_id,campaign_name,spend,frequency,actions',
    filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: 'Grapejuice' }]),
    limit: '200',
  });
  const res = await fetch(`${GRAPH}/${ACCOUNT}/insights?${params}`);
  const body = (await res.json()) as { data?: Row[]; error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `insights ${res.status}`);
  const paused: string[] = [];
  for (const row of body.data ?? []) {
    if (!row.adset_id || row.campaign_id === GRANDPARENT) continue;
    const spend = Number(row.spend ?? 0);
    const frequency = Number(row.frequency ?? 0);
    const purchases = (row.actions ?? [])
      .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
    const cpp = purchases > 0 ? spend / purchases : null;
    const tooOften = frequency > 9 && spend >= 50;
    const tooCostly = cpp != null && cpp > 150 && spend >= 300;
    if (!tooOften && !tooCostly) continue;
    const pause = new URLSearchParams({ access_token: accessToken, status: 'PAUSED' });
    const updated = await fetch(`${GRAPH}/${row.adset_id}`, { method: 'POST', body: pause });
    const updatedBody = (await updated.json()) as { error?: { message?: string } };
    if (!updated.ok || updatedBody.error) {
      logger.warn('metaGuard: pause failed', { adset: row.adset_id, message: updatedBody.error?.message });
      continue;
    }
    paused.push(row.adset_name ?? row.adset_id);
    await getFirestore().collection('programAlerts').add({
      at: new Date().toISOString(),
      kind: 'meta_auto_pause',
      adsetId: row.adset_id,
      name: row.adset_name ?? null,
      reason: tooOften ? 'frequency' : 'cpp',
      spend,
      frequency,
      cpp,
      open: true,
    });
  }
  return { checked: body.data?.length ?? 0, paused };
}

export const scheduledMetaGuard = onSchedule(
  { schedule: 'every 60 minutes', secrets: [token], memory: '256MiB', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore();
    const access = token.value()?.trim();
    if (!access) {
      await db.doc('programJobs/metaGuard').set({ at: new Date().toISOString(), ok: false, error: 'no token' });
      return;
    }
    try {
      const result = await runMetaGuard(access);
      await db.doc('programJobs/metaGuard').set({ at: new Date().toISOString(), ok: true, ...result });
      if (result.paused.length) logger.warn('metaGuard paused ad sets', result);
    } catch (err) {
      logger.error('metaGuard failed', err instanceof Error ? err : new Error(String(err)));
      await db.doc('programJobs/metaGuard').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 300) });
    }
  }
);
