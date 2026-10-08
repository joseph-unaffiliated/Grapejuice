import { defineSecret } from 'firebase-functions/params';
import * as logger from './logger';

export const metaAdsAccessToken = defineSecret('META_ADS_ACCESS_TOKEN');

const AD_ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
/** The ad account also runs Unaffiliated campaigns; only Grapejuice ones count here. */
const CAMPAIGN_FILTER = 'Grapejuice';
const SINCE = '2026-09-01';
const CACHE_MS = 10 * 60 * 1000;

export type MetaAdStats = {
  spend: number;
  linkClicks: number;
  landingPageViews: number;
  addToCart: number;
  registrations: number;
  purchases: number;
};

let cache: { at: number; byAd: Record<string, MetaAdStats> } | null = null;

const ACTION_KEYS: Record<string, keyof MetaAdStats> = {
  landing_page_view: 'landingPageViews',
  'offsite_conversion.fb_pixel_add_to_cart': 'addToCart',
  'offsite_conversion.fb_pixel_complete_registration': 'registrations',
  'offsite_conversion.fb_pixel_purchase': 'purchases',
};

type InsightRow = {
  ad_name?: string;
  spend?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

/** Per-ad Meta results keyed by ad name (what ads pass as utm_content). Null when Meta is unreachable. */
export async function metaStatsByAd(nowMs = Date.now()): Promise<Record<string, MetaAdStats> | null> {
  if (cache && nowMs - cache.at < CACHE_MS) return cache.byAd;
  let token: string;
  try {
    token = metaAdsAccessToken.value();
  } catch {
    return null;
  }
  if (!token) return null;
  const until = new Date(nowMs).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    level: 'ad',
    fields: 'ad_name,spend,inline_link_clicks,actions',
    time_range: JSON.stringify({ since: SINCE, until }),
    filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: CAMPAIGN_FILTER }]),
    limit: '500',
    access_token: token,
  });
  const byAd: Record<string, MetaAdStats> = {};
  let url: string | null = `${GRAPH}/${AD_ACCOUNT}/insights?${params}`;
  try {
    for (let page = 0; url && page < 10; page++) {
      const res = await fetch(url);
      const body = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string }; error?: { message?: string } };
      if (!res.ok || body.error) {
        logger.warn('metaStatsByAd: insights request failed', { status: res.status, message: body.error?.message });
        return null;
      }
      for (const row of body.data ?? []) {
        const name = row.ad_name?.trim();
        if (!name) continue;
        const s = (byAd[name] ??= { spend: 0, linkClicks: 0, landingPageViews: 0, addToCart: 0, registrations: 0, purchases: 0 });
        s.spend += Number(row.spend) || 0;
        s.linkClicks += Number(row.inline_link_clicks) || 0;
        for (const a of row.actions ?? []) {
          const key = ACTION_KEYS[a.action_type];
          if (key) s[key] += Number(a.value) || 0;
        }
      }
      url = body.paging?.next ?? null;
    }
  } catch (err) {
    logger.warn('metaStatsByAd: insights request threw', { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
  for (const s of Object.values(byAd)) s.spend = Math.round(s.spend * 100) / 100;
  cache = { at: nowMs, byAd };
  return byAd;
}
