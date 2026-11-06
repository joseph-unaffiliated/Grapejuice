/**
 * Pauses Meta Shop (post-lock product) ads when the linked catalog item(s) are sold out.
 *
 * Bindings live in code (ad name + catalog itemIds). Optional Firestore
 * `programConfig/metaShopAds` can disable the job or override adIds once Ads Manager
 * IDs are known. Ad account automated rules can't do inventory, so this runs here —
 * same Ads Management token as `scheduledMetaGuard`.
 */
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import {
  availabilityAllowsDirectPurchase,
  resolveAvailability,
  type CatalogAvailabilityItem,
  type CatalogInventoryCounters,
} from './catalogAvailability';
import { CATALOG_HOLIDAY, inventoryDocRef, parseCounters } from './catalogInventory';

const token = defineSecret('META_ADS_ACCESS_TOKEN_ADSMANAGEMENT');
const ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
const CONFIG_DOC = 'programConfig/metaShopAds';
const CAMPAIGN_NAME_CONTAINS = 'Shop';

export type ShopAdBinding = {
  /** Exact Meta ad name (utm_content). */
  adName: string;
  /** Pause when any of these catalog items cannot be bought à la carte. */
  itemIds: string[];
  /** Optional explicit Meta ad id(s); skips name lookup when set. */
  adIds?: string[];
};

/**
 * Default Shop campaign ads ↔ catalog. Keep ad names in Ads Manager identical.
 * Frame files live in /Untraditional/Ads/Product Ads/.
 */
export const DEFAULT_SHOP_AD_BINDINGS: ShopAdBinding[] = [
  { adName: 'shop-arch-menorah', itemIds: ['arch-menorah'] }, // Frame 105
  { adName: 'shop-dreidel-cookie-cutters', itemIds: ['dreidel-cookie-cutters'] }, // Frame 108
  {
    adName: 'shop-stuffies',
    itemIds: [
      'gimmel-the-dreidel-stuffie',
      'crispy-the-latke-stuffie',
      'jelly-the-sufganiyah-stuffie',
      'shamash-the-menorah-stuffie',
    ],
  }, // Frame 109 → /store/stuffies
  { adName: 'shop-shamash-stuffie', itemIds: ['shamash-the-menorah-stuffie'] }, // Frame 110
  { adName: 'shop-toddler-play-menorah', itemIds: ['toddler-play-menorah'] }, // Frame 111
  { adName: 'shop-airdry-clay-menorah', itemIds: ['airdry-clay-menorah'] }, // Frame 112
  { adName: 'shop-wrapping-paper', itemIds: ['wrapping-paper'] }, // Frame 113
  { adName: 'shop-big-bag-of-gelt', itemIds: ['big-bag-of-gelt'] }, // Frame 114
];

type ConfigDoc = {
  enabled?: boolean;
  campaignNameContains?: string;
  bindings?: ShopAdBinding[];
};

export function mergeShopAdBindings(
  defaults: ShopAdBinding[],
  override: ShopAdBinding[] | undefined
): ShopAdBinding[] {
  if (!override?.length) return defaults;
  const byName = new Map(defaults.map((b) => [b.adName, { ...b }]));
  for (const row of override) {
    const name = String(row.adName ?? '').trim();
    if (!name) continue;
    const prev = byName.get(name);
    byName.set(name, {
      adName: name,
      itemIds: Array.isArray(row.itemIds) && row.itemIds.length ? row.itemIds.map(String) : prev?.itemIds ?? [],
      adIds: Array.isArray(row.adIds) && row.adIds.length ? row.adIds.map(String) : prev?.adIds,
    });
  }
  return [...byName.values()].filter((b) => b.itemIds.length > 0);
}

export function bindingNeedsPause(availabilities: Array<{ allowsPurchase: boolean }>): boolean {
  if (!availabilities.length) return true;
  return availabilities.some((a) => !a.allowsPurchase);
}

function itemFromSnap(itemId: string, data: FirebaseFirestore.DocumentData): CatalogAvailabilityItem {
  return {
    id: itemId,
    name: typeof data.name === 'string' ? data.name : itemId,
    category: typeof data.category === 'string' ? data.category : null,
    categories: Array.isArray(data.categories)
      ? data.categories.filter((c: unknown): c is string => typeof c === 'string')
      : undefined,
    inventory: typeof data.inventory === 'number' ? data.inventory : null,
    setAside: typeof data.setAside === 'number' ? data.setAside : null,
    directSaleCapBeforeLock:
      typeof data.directSaleCapBeforeLock === 'number' ? data.directSaleCapBeforeLock : null,
    sellAfterLock:
      data.sellAfterLock === 'yes' || data.sellAfterLock === 'flag' || data.sellAfterLock === 'no'
        ? data.sellAfterLock
        : null,
  };
}

async function getLockAt(db: Firestore): Promise<string | null> {
  const snap = await db.doc('config/hanukkah-2026').get();
  const lockAt = snap.data()?.lockAt;
  return typeof lockAt === 'string' ? lockAt : null;
}

async function loadBindingAvailability(
  db: Firestore,
  binding: ShopAdBinding,
  lockAt: string | null,
  now: Date
): Promise<Array<{ itemId: string; allowsPurchase: boolean; remaining: number | null }>> {
  const out: Array<{ itemId: string; allowsPurchase: boolean; remaining: number | null }> = [];
  for (const itemId of binding.itemIds) {
    const [itemSnap, invSnap] = await Promise.all([
      db.doc(`catalog/${CATALOG_HOLIDAY}/items/${itemId}`).get(),
      inventoryDocRef(db, itemId).get(),
    ]);
    if (!itemSnap.exists) {
      out.push({ itemId, allowsPurchase: false, remaining: 0 });
      continue;
    }
    const item = itemFromSnap(itemId, itemSnap.data() ?? {});
    const counters: CatalogInventoryCounters = parseCounters(invSnap.data());
    const avail = resolveAvailability(item, counters, lockAt, now);
    const allows = availabilityAllowsDirectPurchase(avail);
    const remaining =
      avail.status === 'direct' || avail.status === 'limited' ? avail.remaining : 0;
    out.push({ itemId, allowsPurchase: allows, remaining });
  }
  return out;
}

async function pauseMetaAd(
  accessToken: string,
  adId: string
): Promise<{ ok: boolean; message?: string }> {
  const body = new URLSearchParams({ access_token: accessToken, status: 'PAUSED' });
  const res = await fetch(`${GRAPH}/${adId}`, { method: 'POST', body });
  const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || json.error) return { ok: false, message: json.error?.message ?? `HTTP ${res.status}` };
  return { ok: true };
}

type MetaAdRow = { id: string; name: string; status: string; campaign?: { name?: string } };

async function listActiveShopAds(
  accessToken: string,
  campaignNameContains: string
): Promise<MetaAdRow[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,status,campaign{name}',
    filtering: JSON.stringify([
      { field: 'campaign.name', operator: 'CONTAIN', value: campaignNameContains },
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
    ]),
    limit: '200',
  });
  const rows: MetaAdRow[] = [];
  let url: string | null = `${GRAPH}/${ACCOUNT}/ads?${params}`;
  for (let page = 0; url && page < 5; page++) {
    const res = await fetch(url);
    const body = (await res.json()) as {
      data?: MetaAdRow[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `ads list ${res.status}`);
    for (const row of body.data ?? []) {
      if (row.id && row.name) rows.push(row);
    }
    url = body.paging?.next ?? null;
  }
  return rows;
}

export type ShopInventoryPauseResult = {
  checked: number;
  paused: string[];
  skipped: string[];
  errors: string[];
};

export async function runMetaShopInventoryPause(
  db: Firestore,
  accessToken: string,
  now: Date = new Date(),
  fetchAds: typeof listActiveShopAds = listActiveShopAds,
  pauseAd: typeof pauseMetaAd = pauseMetaAd
): Promise<ShopInventoryPauseResult> {
  const configSnap = await db.doc(CONFIG_DOC).get();
  const config = (configSnap.data() ?? {}) as ConfigDoc;
  if (config.enabled === false) {
    return { checked: 0, paused: [], skipped: ['disabled'], errors: [] };
  }
  const bindings = mergeShopAdBindings(DEFAULT_SHOP_AD_BINDINGS, config.bindings);
  const campaignNeedle = (config.campaignNameContains ?? CAMPAIGN_NAME_CONTAINS).trim() || CAMPAIGN_NAME_CONTAINS;
  const lockAt = await getLockAt(db);
  const liveAds = await fetchAds(accessToken, campaignNeedle);
  const byName = new Map(liveAds.map((a) => [a.name.trim(), a]));

  const result: ShopInventoryPauseResult = { checked: 0, paused: [], skipped: [], errors: [] };

  for (const binding of bindings) {
    result.checked += 1;
    const avails = await loadBindingAvailability(db, binding, lockAt, now);
    if (!bindingNeedsPause(avails.map((a) => ({ allowsPurchase: a.allowsPurchase })))) {
      result.skipped.push(binding.adName);
      continue;
    }

    const adIds =
      binding.adIds?.length
        ? binding.adIds
        : (() => {
            const hit = byName.get(binding.adName);
            return hit ? [hit.id] : [];
          })();

    if (!adIds.length) {
      result.skipped.push(`${binding.adName}:no-active-ad`);
      continue;
    }

    for (const adId of adIds) {
      const paused = await pauseAd(accessToken, adId);
      if (!paused.ok) {
        result.errors.push(`${binding.adName}:${paused.message ?? 'pause failed'}`);
        logger.warn('metaShopInventoryPause: pause failed', {
          adName: binding.adName,
          adId,
          message: paused.message,
        });
        continue;
      }
      result.paused.push(binding.adName);
      await db.collection('programAlerts').add({
        at: now.toISOString(),
        kind: 'meta_shop_inventory_pause',
        adName: binding.adName,
        adId,
        itemIds: binding.itemIds,
        availability: avails,
        open: true,
      });
    }
  }

  return result;
}

export const scheduledMetaShopInventoryPause = onSchedule(
  { schedule: 'every 15 minutes', secrets: [token], memory: '256MiB', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore();
    const access = token.value()?.trim();
    if (!access) {
      await db.doc('programJobs/metaShopInventoryPause').set({
        at: new Date().toISOString(),
        ok: false,
        error: 'no token',
      });
      return;
    }
    try {
      const result = await runMetaShopInventoryPause(db, access);
      await db.doc('programJobs/metaShopInventoryPause').set({
        at: new Date().toISOString(),
        ok: true,
        ...result,
      });
      if (result.paused.length) logger.warn('metaShopInventoryPause paused ads', result);
      if (result.errors.length) logger.warn('metaShopInventoryPause errors', result);
    } catch (err) {
      logger.error(
        'metaShopInventoryPause failed',
        err instanceof Error ? err : new Error(String(err))
      );
      await db.doc('programJobs/metaShopInventoryPause').set({
        at: new Date().toISOString(),
        ok: false,
        error: String(err).slice(0, 300),
      });
    }
  }
);
