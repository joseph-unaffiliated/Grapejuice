#!/usr/bin/env node
/**
 * Create the post-lock Grapejuice Shop Meta campaign (videos + copy + Purchase).
 * Ads stay PAUSED until you turn the campaign on after boxes lock.
 *
 *   node scripts/meta-create-shop-ads.mjs           # dry run
 *   node scripts/meta-create-shop-ads.mjs --apply   # upload + create
 *
 * Idempotent by name: skips an ad/ad set/campaign that already exists.
 * Does not print the access token.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const ACCOUNT = 'act_1311852520406314';
const GRAPH = 'https://graph.facebook.com/v21.0';
const PAGE_ID = '1357076990821185';
const IG_USER_ID = '17841424445570721';
const PIXEL_ID = '809409995127436';
const PURCHASERS_EXCLUSION = '120247797137350519';
const CAMPAIGN_NAME = 'Grapejuice Co - Shop';
const DAILY_BUDGET_CENTS = '20000'; // $200/day CBO (box campaigns off after lock)
const ADSET_START_TIME = '2026-11-21T00:00:00-05:00'; // after FBA inbound confirmed
const ADS_DIR = '/Users/joseph/Dropbox/Unaffiliated/Untraditional/Ads/Product Ads';
const TOKEN = readFileSync(
  '/Users/joseph/Dropbox/Unaffiliated/Data Configuration/Keys/META_ADS_ACCESS_TOKEN_ADSMANAGEMENT.txt',
  'utf8'
).trim();

const ADS = [
  {
    adName: 'shop-arch-menorah',
    frame: 'Frame 105.mp4',
    link: 'https://grapejuice.co/product/arch-menorah',
    body: 'Reminiscent of ancient stone, this hanukkiah creates a tangible connection to the ancient story. Travertine. Nine nights of light on your mantel.',
    headline: 'Ancient stone. Modern mantel.',
    description: 'Travertine hanukkiah · $240',
  },
  {
    adName: 'shop-dreidel-cookie-cutters',
    frame: 'Frame 108.mp4',
    link: 'https://grapejuice.co/product/dreidel-cookie-cutters',
    body: 'Dreidel-shaped cookie cutters for baking Hanukkah treats. Press into dough, decorate, share across the eight nights.\n\nMetal cutters. Hand wash. $8.',
    headline: 'Bake a dreidel',
    description: 'Cookie cutters · $8',
  },
  {
    adName: 'shop-stuffies',
    frame: 'Frame 109.mp4',
    link: 'https://grapejuice.co/store/stuffies',
    body: 'Soft Hanukkah friends: a dreidel, a latke, a sufganiyah, and a menorah. Made for cuddles and pretend play — not open flame.\n\n$25 each.',
    headline: 'Hanukkah, soft',
    description: 'Stuffies · $25 each',
  },
  {
    adName: 'shop-shamash-stuffie',
    frame: 'Frame 110.mp4',
    link: 'https://grapejuice.co/product/shamash-the-menorah-stuffie',
    body: 'Shamash is a plush menorah soft toy named for the helper candle — for cuddles and pretend candle-lighting, not open flame.\n\n$25. Spot clean.',
    headline: 'Meet Shamash',
    description: 'Menorah stuffie · $25',
  },
  {
    adName: 'shop-toddler-play-menorah',
    frame: 'Frame 111.mp4',
    link: 'https://grapejuice.co/product/toddler-play-menorah',
    body: 'A wooden play menorah for toddlers to practice candle-lighting with play candles — no open flame. Teach the nights and the shamash, hands-on.\n\nWood + nine felt-flame play candles. $25.',
    headline: 'Practice the nights',
    description: 'Toddler play menorah · $25',
  },
  {
    adName: 'shop-airdry-clay-menorah',
    frame: 'Frame 112.mp4',
    link: 'https://grapejuice.co/product/airdry-clay-menorah',
    body: "Make your own hanukkiah — let creativity go wild. One pack of air-dry clay and nine brass candle cups (don't put candles directly in clay).\n\nKid-safe kit. $10.",
    headline: 'Make your own hanukkiah',
    description: 'Air-dry clay kit · $10',
  },
  {
    adName: 'shop-wrapping-paper',
    frame: 'Frame 113.mp4',
    link: 'https://grapejuice.co/product/wrapping-paper',
    body: "A wrapping paper set for dressing Hanukkah gifts across the eight nights — illustrated sheets you'll actually want to keep.\n\n$15.",
    headline: 'Wrap the eight nights',
    description: 'Wrapping paper set · $15',
  },
  {
    adName: 'shop-big-bag-of-gelt',
    frame: 'Frame 114.mp4',
    link: 'https://grapejuice.co/product/big-bag-of-gelt',
    body: 'A big bag of chocolate gelt — 5 large and 20 small coins — for dreidel pots and Hanukkah gifts. Vegan, dairy-free (pareve); not certified kosher.\n\n$10.',
    headline: 'Chocolate for the pot',
    description: 'Big bag of gelt · $10',
  },
];

async function graph(path, params = {}, method = 'GET') {
  const body = new URLSearchParams({ access_token: TOKEN });
  for (const [k, v] of Object.entries(params)) {
    body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const url = method === 'GET' ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === 'GET' ? undefined : { method, body });
  const json = await res.json();
  if (json.error) {
    const e = new Error(`${method} ${path}: ${json.error.message}`);
    e.meta = json.error;
    throw e;
  }
  return json;
}

async function graphAll(path, params = {}) {
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page++) {
    const q = { ...params, limit: '100', ...(after ? { after } : {}) };
    const json = await graph(path, q);
    out.push(...(json.data ?? []));
    after = json.paging?.cursors?.after;
    if (!json.paging?.next || !after) break;
  }
  return out;
}

async function uploadVideo(filePath, title) {
  // Multipart via curl — Node FormData + Blob was unreliable for these files.
  const result = spawnSync(
    'curl',
    [
      '-sS',
      '-X',
      'POST',
      `${GRAPH}/${ACCOUNT}/advideos`,
      '-F',
      `access_token=${TOKEN}`,
      '-F',
      `title=${title}`,
      '-F',
      `name=${title}`,
      '-F',
      `source=@${filePath}`,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(`curl upload failed for ${title}: ${result.stderr || result.stdout}`);
  }
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new Error(`curl upload non-JSON for ${title}: ${result.stdout.slice(0, 300)}`);
  }
  if (json.error) throw new Error(`upload ${title}: ${json.error.message}`);
  const videoId = json.id;
  if (!videoId) throw new Error(`upload ${title}: no id in ${result.stdout.slice(0, 300)}`);

  for (let i = 0; i < 90; i++) {
    const status = await graph(videoId, { fields: 'status,title' });
    const videoStatus = status.status?.video_status;
    if (videoStatus === 'ready') return videoId;
    if (videoStatus === 'error') {
      throw new Error(`video processing error: ${title} ${JSON.stringify(status.status)}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`video not ready after wait: ${title} (${videoId})`);
}

async function preferredThumbnailUrl(videoId) {
  const thumbs = await graph(`${videoId}/thumbnails`, {
    fields: 'id,uri,is_preferred,height,width',
  });
  const rows = thumbs.data ?? [];
  const preferred = rows.find((t) => t.is_preferred && t.uri) ?? rows.find((t) => t.uri);
  if (!preferred?.uri) throw new Error(`no thumbnail for video ${videoId}`);
  return preferred.uri;
}

function targeting() {
  return {
    age_min: 18,
    age_max: 65,
    geo_locations: {
      countries: ['US'],
      location_types: ['home', 'recent', 'frequently_in'],
    },
    excluded_custom_audiences: [{ id: PURCHASERS_EXCLUSION }],
    targeting_automation: { advantage_audience: 1 },
    publisher_platforms: ['instagram'],
    instagram_positions: ['stream', 'story', 'reels'],
  };
}

async function main() {
  const plan = {
    campaign: CAMPAIGN_NAME,
    dailyBudgetUsd: Number(DAILY_BUDGET_CENTS) / 100,
    status: 'PAUSED',
    adSetStartTime: ADSET_START_TIME,
    ads: ADS.map((a) => ({
      adName: a.adName,
      adSet: `Shop - ${a.adName}`,
      frame: a.frame,
      link: a.link,
      headline: a.headline,
    })),
    apply: APPLY,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!APPLY) {
    console.log(JSON.stringify({ dryRun: true, hint: 'Re-run with --apply to create' }));
    return;
  }

  const campaigns = await graphAll(`${ACCOUNT}/campaigns`, {
    fields: 'id,name,status',
    filtering: [{ field: 'name', operator: 'EQUAL', value: CAMPAIGN_NAME }],
  });
  let campaignId = campaigns[0]?.id;
  if (!campaignId) {
    const made = await graph(
      `${ACCOUNT}/campaigns`,
      {
        name: CAMPAIGN_NAME,
        objective: 'OUTCOME_SALES',
        status: 'PAUSED',
        special_ad_categories: [],
        buying_type: 'AUCTION',
        daily_budget: DAILY_BUDGET_CENTS,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      },
      'POST'
    );
    campaignId = made.id;
    console.log(JSON.stringify({ createdCampaign: campaignId }));
  } else {
    console.log(JSON.stringify({ existingCampaign: campaignId, status: campaigns[0].status }));
  }

  const existingAdSets = await graphAll(`${campaignId}/adsets`, { fields: 'id,name,status' });
  const adSetByName = new Map(existingAdSets.map((s) => [s.name, s]));
  const existingAds = await graphAll(`${campaignId}/ads`, { fields: 'id,name,status' });
  const adByName = new Map(existingAds.map((a) => [a.name, a]));

  // Reuse already-uploaded videos titled like the frame file when present.
  const existingVideos = await graphAll(`${ACCOUNT}/advideos`, { fields: 'id,title' });
  const videoByTitle = new Map(
    (existingVideos ?? []).filter((v) => v.title).map((v) => [v.title, v.id])
  );

  const results = [];
  for (const ad of ADS) {
    const adSetName = `Shop - ${ad.adName}`;
    const videoTitle = `${ad.adName}-${ad.frame.replace(/\s+/g, '-')}`;
    let videoId = videoByTitle.get(videoTitle) || videoByTitle.get(`shop-${videoTitle}`);
    // Reuse the successful test upload for stuffies if present.
    if (!videoId && ad.adName === 'shop-stuffies') {
      videoId = videoByTitle.get('shop-stuffies-Frame-109.mp4');
    }
    if (!videoId) {
      const filePath = join(ADS_DIR, ad.frame);
      console.log(JSON.stringify({ uploading: ad.frame, as: videoTitle, bytes: statSync(filePath).size }));
      videoId = await uploadVideo(filePath, videoTitle);
      videoByTitle.set(videoTitle, videoId);
      console.log(JSON.stringify({ uploaded: videoTitle, videoId }));
    } else {
      console.log(JSON.stringify({ reusedVideo: videoTitle, videoId }));
    }

    let adSetId = adSetByName.get(adSetName)?.id;
    if (!adSetId) {
      const made = await graph(
        `${ACCOUNT}/adsets`,
        {
          name: adSetName,
          campaign_id: campaignId,
          status: 'PAUSED',
          start_time: ADSET_START_TIME,
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          promoted_object: {
            pixel_id: PIXEL_ID,
            custom_event_type: 'PURCHASE',
          },
          targeting: targeting(),
          destination_type: 'WEBSITE',
          attribution_spec: [
            { event_type: 'CLICK_THROUGH', window_days: 7 },
            { event_type: 'VIEW_THROUGH', window_days: 1 },
          ],
        },
        'POST'
      );
      adSetId = made.id;
      adSetByName.set(adSetName, { id: adSetId, name: adSetName, status: 'PAUSED' });
      console.log(JSON.stringify({ createdAdSet: adSetName, id: adSetId }));
    } else {
      console.log(JSON.stringify({ existingAdSet: adSetName, id: adSetId }));
    }

    if (adByName.has(ad.adName)) {
      results.push({ adName: ad.adName, adId: adByName.get(ad.adName).id, skipped: true });
      console.log(JSON.stringify({ existingAd: ad.adName, id: adByName.get(ad.adName).id }));
      continue;
    }

    const imageUrl = await preferredThumbnailUrl(videoId);
    const creative = await graph(
      `${ACCOUNT}/adcreatives`,
      {
        name: `${ad.headline} ${ad.adName}`,
        object_story_spec: {
          page_id: PAGE_ID,
          instagram_user_id: IG_USER_ID,
          video_data: {
            video_id: videoId,
            image_url: imageUrl,
            message: ad.body,
            title: ad.headline,
            link_description: ad.description,
            call_to_action: {
              type: 'SHOP_NOW',
              value: { link: ad.link },
            },
          },
        },
        url_tags:
          'utm_source=meta&utm_medium=paid_social&utm_campaign=grapejuice-shop&utm_content={{ad.name}}',
      },
      'POST'
    );

    const madeAd = await graph(
      `${ACCOUNT}/ads`,
      {
        name: ad.adName,
        adset_id: adSetId,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      },
      'POST'
    );
    adByName.set(ad.adName, { id: madeAd.id, name: ad.adName, status: 'PAUSED' });
    results.push({ adName: ad.adName, adId: madeAd.id, creativeId: creative.id, videoId, adSetId });
    console.log(JSON.stringify({ createdAd: ad.adName, id: madeAd.id, creativeId: creative.id }));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        campaignId,
        campaignName: CAMPAIGN_NAME,
        status: 'PAUSED',
        results,
        note: 'Turn the campaign ACTIVE after boxes are fully locked (after Mon noon Nov 9 extension). Inventory auto-pause matches these ad names.',
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err.message || err), meta: err.meta ?? null }));
  process.exit(1);
});
