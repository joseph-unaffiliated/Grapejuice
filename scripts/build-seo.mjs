#!/usr/bin/env node
/**
 * Static SEO pages for crawlers that don't run JavaScript. Runs after
 * `expo export --platform web` (see the build:web script) and writes into dist/:
 *
 *   - one HTML file per public route (cleanUrls serves /store/menorahs from store/menorahs.html)
 *     with title, description, canonical, Open Graph / Twitter tags, JSON-LD and a plain
 *     semantic body inside #root that React replaces on load
 *   - robots.txt, sitemap.xml, llms.txt, llms-full.txt
 *
 * Data: public Firestore reads over REST (catalog, inventory counters, landings, config) plus
 * the app's own copy constants, loaded through scripts/lib/loadAppModules.cjs.
 * Usage: node scripts/build-seo.mjs [--dist dist]
 */
process.env.TZ = 'America/New_York';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadAppModule, ROOT } = require('./lib/loadAppModules.cjs');

const distArg = process.argv.indexOf('--dist');
const DIST = path.resolve(ROOT, distArg > -1 ? process.argv[distArg + 1] : 'dist');
const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'grapejuice-pilot';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const seo = loadAppModule('src/constants/seo');
const { STOREFRONT_CATEGORIES, filterByStorefrontCategory, storefrontCategoryForItem } = loadAppModule(
  'src/constants/storefrontCategories'
);
const { OUR_STORY_COPY } = loadAppModule('src/constants/storefrontOurStoryCopy');
const { TERMS_COPY } = loadAppModule('src/constants/storefrontTermsCopy');
const { PRIVACY_COPY } = loadAppModule('src/constants/storefrontPrivacyCopy');
const { giftLandingCopy } = loadAppModule('src/constants/storefrontGiftCopy');
const { LANDING_AUDIENCES } = loadAppModule('src/constants/landingAudiences');
const { RESERVED_LANDING_PATHS } = loadAppModule('src/constants/landingPaths');
const { resolveCatalogDisplayPrices } = loadAppModule('src/services/box/pricing');
const { listBoxCentsForKids } = loadAppModule('src/services/box/boxRules');
const { resolveAvailability } = loadAppModule('src/services/catalog/availability');
const lockDates = loadAppModule('src/constants/hanukkahBoxLock');

const ORIGIN = seo.SITE_ORIGIN;
const HOME_OG_IMAGE = '/og/home.jpg';

// ---------------------------------------------------------------- Firestore REST (public reads)

function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function listCollection(rel) {
  const docs = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
    const body = await fetchJson(`${FIRESTORE}/${rel}?${qs}`);
    for (const d of body.documents ?? []) {
      docs.push({ id: d.name.split('/').pop(), updateTime: d.updateTime, ...decodeFields(d.fields ?? {}) });
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

async function getDoc(rel) {
  const body = await fetchJson(`${FIRESTORE}/${rel}`);
  return { id: body.name.split('/').pop(), updateTime: body.updateTime, ...decodeFields(body.fields ?? {}) };
}

async function loadData() {
  const [items, counters, landings, config] = await Promise.all([
    listCollection('catalog/hanukkah/items'),
    listCollection('catalog/hanukkah/inventory').catch(() => []),
    listCollection('landings').catch(() => []),
    getDoc('config/hanukkah-2026').catch(() => ({})),
  ]);
  return { items, counters, landings, config };
}

// ---------------------------------------------------------------- helpers

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const jsonLd = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const dollars = (cents) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const plain = (s) => String(s ?? '').replace(/[˘ˇ]/g, '').replace(/\s+/g, ' ').trim();
const lineText = (l) => plain(typeof l === 'string' ? l : l?.body);
const paraText = (p) => (Array.isArray(p) ? p.map(lineText).join(' ') : lineText(p));
const abs = (p) => (/^https?:/.test(p) ? p : `${ORIGIN}${p}`);
const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : null);
const maxDate = (dates) => dates.filter(Boolean).sort().pop() ?? null;

function gitDate(relFile) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relFile], { cwd: ROOT })
      .toString()
      .trim();
    if (out) return out;
  } catch {
    /* not a git checkout */
  }
  try {
    return fs.statSync(path.join(ROOT, relFile)).mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function normalizeItem(raw) {
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return {
    ...raw,
    name: plain(raw.name),
    description: String(raw.description ?? '').trim(),
    categories: arr(raw.categories),
    ageGroups: arr(raw.ageGroups),
    swapOptions: arr(raw.swapOptions),
    imageUrls: arr(raw.imageUrls),
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
  };
}

function itemImages(item) {
  const urls = [item.imageUrl, ...item.imageUrls].filter((u) => typeof u === 'string' && /^https:/.test(u));
  return [...new Set(urls)];
}

const productPath = (item) => `/product/${encodeURIComponent(item.id)}`;
const categoryPath = (slug) => `/store/${slug}`;

// ---------------------------------------------------------------- page shell

function headTags({ title, description, path: canonical, ogType = 'website', image, noCanonical = false, ld = [] }) {
  const url = canonical ? abs(canonical) : `${ORIGIN}/`;
  const img = abs(image || HOME_OG_IMAGE);
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    noCanonical ? '' : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:site_name" content="${esc(seo.SITE_NAME)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    ...ld.map(jsonLd),
  ]
    .filter(Boolean)
    .join('\n    ');
}

function siteNav() {
  const cats = STOREFRONT_CATEGORIES.map((c) => `<li><a href="${categoryPath(c.slug)}">${esc(c.label)}</a></li>`);
  return `<header><p><a href="/">Grapejuice</a></p><nav aria-label="Shop"><ul>${cats.join('')}<li><a href="/gift">Gifts</a></li><li><a href="/story">Our Story</a></li></ul></nav></header>`;
}

function siteFooter(landingLinks) {
  const links = [
    ['/gift', 'Give a gift'],
    ['/story', 'Our Story'],
    ...landingLinks,
    ['/terms', 'Terms of Use and Sale'],
    ['/privacy', 'Privacy Policy'],
  ];
  return `<footer><nav aria-label="More"><ul>${links
    .map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`)
    .join('')}</ul></nav><p>Grapejuice is made by Untraditional, an Unaffiliated brand. Questions: <a href="mailto:hello@grapejuice.co">hello@grapejuice.co</a>. We ship within the U.S.</p></footer>`;
}

function breadcrumbs(trail) {
  const html = `<nav aria-label="Breadcrumb"><ol>${trail
    .map(([label, href], i) =>
      i === trail.length - 1 ? `<li>${esc(label)}</li>` : `<li><a href="${href}">${esc(label)}</a></li>`
    )
    .join('')}</ol></nav>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([label, href], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: label,
      item: abs(href),
    })),
  };
  return { html, ld };
}

// ---------------------------------------------------------------- build

async function main() {
  const indexPath = path.join(DIST, 'index.html');
  // Hosting ignores dotfiles; keeps the pristine export shell so this step can re-run.
  const pristinePath = path.join(DIST, '.seo-template.html');
  if (!fs.existsSync(indexPath)) throw new Error(`Missing ${indexPath}; run expo export first.`);
  const TITLE_TAG = /<title>[^<]*<\/title>/;
  const ROOT_DIV = '<div id="root"></div>';
  let template = fs.readFileSync(indexPath, 'utf8');
  if (template.includes(ROOT_DIV)) fs.writeFileSync(pristinePath, template);
  else if (fs.existsSync(pristinePath)) template = fs.readFileSync(pristinePath, 'utf8');
  if (!TITLE_TAG.test(template) || !template.includes(ROOT_DIV)) {
    throw new Error('dist/index.html no longer has <title> and an empty #root; update build-seo.mjs.');
  }

  let data;
  try {
    data = await loadData();
  } catch (err) {
    // Shipping category pages and a sitemap without products would hurt more than a failed deploy.
    if (process.env.SEO_ALLOW_OFFLINE !== '1') {
      throw new Error(`Firestore read failed (${err.message}). Set SEO_ALLOW_OFFLINE=1 to build without catalog data.`);
    }
    console.warn(`[build-seo] Firestore read failed (${err.message}); building without catalog data.`);
    data = { items: [], counters: [], landings: [], config: {} };
  }
  if (!data.items.length && process.env.SEO_ALLOW_OFFLINE !== '1') {
    throw new Error('Firestore returned no catalog items; refusing to write product-less SEO pages.');
  }
  const { config } = data;
  const counters = new Map(data.counters.map((c) => [c.id, c]));
  const allItems = data.items.map(normalizeItem).filter((i) => i.name);

  const visibleIds = new Set();
  const byCategory = new Map();
  for (const cat of STOREFRONT_CATEGORIES) {
    const list = filterByStorefrontCategory(allItems, cat.slug).sort(
      (a, b) => (a.storefrontRank ?? 9999) - (b.storefrontRank ?? 9999) || a.name.localeCompare(b.name)
    );
    byCategory.set(cat.slug, list);
    for (const i of list) visibleIds.add(i.id);
  }
  const products = allItems.filter((i) => visibleIds.has(i.id));

  const lockDay = lockDates.boxLockDayLabel(config.lockAt);
  const arrivesBy =
    lockDates.formatShortMonthDay(config.estimatedDeliveryBy) ??
    lockDates.formatShortMonthDay(lockDates.HANUKKAH_DELIVERY_FALLBACK_ISO);
  const startsOn =
    lockDates.formatShortMonthDay(config.startsOn) ??
    lockDates.formatShortMonthDay(lockDates.HANUKKAH_STARTS_FALLBACK_ISO);
  const oneKid = listBoxCentsForKids(1);
  const perExtraKid = listBoxCentsForKids(2) - oneKid;
  const priceLine = `${dollars(oneKid)} covers a box with up to one kid, plus ${dollars(perExtraKid)} for each additional kid. Shipping is free, and you aren't charged until the box ships.`;
  const datesLine = `Customize your box until ${lockDay}. Boxes arrive by ${arrivesBy}. Hanukkah starts ${startsOn}.`;
  const gift = giftLandingCopy({ lockDay, arrivesBy, startsOn });
  const boxLine = gift.lead.split(/(?<=\.)\s/)[0];

  const offerFor = (item) => {
    const { memberCents, nonMemberCents } = resolveCatalogDisplayPrices(item);
    const avail = resolveAvailability(item, counters.get(item.id), config.lockAt ?? null);
    const direct = avail.status === 'direct' || avail.status === 'limited';
    const priceCents = direct ? nonMemberCents || memberCents : memberCents || nonMemberCents;
    const availability =
      avail.status === 'sold_out'
        ? 'https://schema.org/SoldOut'
        : avail.status === 'limited'
          ? 'https://schema.org/LimitedAvailability'
          : 'https://schema.org/InStock';
    const note = direct
      ? 'Buy it on its own or add it to a Hanukkah box.'
      : avail.status === 'sold_out'
        ? 'Sold out.'
        : 'Available in a Grapejuice Hanukkah box.';
    return { priceCents, memberCents, nonMemberCents, availability, note };
  };

  // Landings: code seeds, overridden by CMS docs with sections, plus CMS-only pages.
  const cmsById = new Map(data.landings.map((d) => [d.id, d]));
  const landingPages = [];
  const seen = new Set();
  for (const seed of Object.values(LANDING_AUDIENCES)) {
    const cms = cmsById.get(seed.id);
    const eff = cms?.sections?.length ? { ...seed, ...cms, path: cms.path || seed.path } : seed;
    landingPages.push({ ...eff, updateTime: cms?.updateTime ?? null, source: 'src/constants/landingAudiences.ts' });
    seen.add(seed.id);
  }
  for (const doc of data.landings) {
    if (seen.has(doc.id) || !doc.sections?.length || typeof doc.path !== 'string') continue;
    landingPages.push({ ...doc, source: null });
  }
  const landings = landingPages.filter((l) => {
    const p = String(l.path || '').toLowerCase();
    return p && p !== '/gift' && !RESERVED_LANDING_PATHS.includes(p) && !seo.isPrivatePath(p);
  });
  const heroOf = (l) => {
    const hero = (l.sections ?? []).find((s) => s?.type === 'hero');
    return {
      headline: plain(hero?.slot?.headline ?? hero?.headline ?? l.navLabel),
      body: plain(hero?.slot?.body ?? hero?.body ?? ''),
    };
  };
  const landingLinks = landings.map((l) => [l.path, plain(l.navLabel) || heroOf(l).headline]);

  const pages = [];
  const page = (p) => pages.push(p);
  const footer = siteFooter(landingLinks);
  const productList = (list) =>
    `<ul>${list
      .map((i) => {
        const o = offerFor(i);
        return `<li><a href="${productPath(i)}">${esc(i.name)}</a>${o.priceCents ? ` — ${dollars(o.priceCents)}` : ''}</li>`;
      })
      .join('')}</ul>`;

  // Home
  const featured = (byCategory.get('collection') ?? products).slice(0, 24);
  const latest = maxDate(products.map((i) => dateOnly(i.updateTime)));
  page({
    path: '/',
    title: seo.HOME_TITLE,
    description: seo.DEFAULT_SEO_DESCRIPTION,
    noCanonical: true,
    lastmod: latest ?? gitDate('src/constants/seo.ts'),
    priority: '1.0',
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: seo.SITE_NAME,
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/brand/grapejuice-logomark.png`,
        email: 'hello@grapejuice.co',
        description: seo.DEFAULT_SEO_DESCRIPTION,
        parentOrganization: { '@type': 'Organization', name: 'Unaffiliated Inc.' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: seo.SITE_NAME,
        url: `${ORIGIN}/`,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/store/collection?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
    body: `<h1>Hanukkah made easy</h1>
<p>Everything you need, delivered straight to your home.</p>
<p>${esc(boxLine)} Shipping is free.</p>
<p>Build your box (starting at ${dollars(oneKid)}). ${esc(priceLine)} ${esc(datesLine)}</p>
<section><h2>Shop by aisle</h2><ul>${STOREFRONT_CATEGORIES.map(
      (c) => `<li><a href="${categoryPath(c.slug)}">${esc(c.title)}</a>: ${esc(c.description)}</li>`
    ).join('')}</ul></section>
${featured.length ? `<section><h2>From the collection</h2>${productList(featured)}</section>` : ''}
<section><h2>Giving a gift?</h2><p>${esc(seo.GIFT_SEO_DESCRIPTION)} <a href="/gift">Give a Hanukkah gift</a>.</p></section>`,
  });

  // Categories
  for (const cat of STOREFRONT_CATEGORIES) {
    const list = byCategory.get(cat.slug) ?? [];
    const meta = seo.staticSeoForPath(categoryPath(cat.slug));
    const crumbs = breadcrumbs([
      ['Home', '/'],
      [cat.title, categoryPath(cat.slug)],
    ]);
    page({
      path: categoryPath(cat.slug),
      title: meta.title,
      description: meta.description,
      image: list.map(itemImages).find((imgs) => imgs.length)?.[0],
      lastmod: maxDate(list.map((i) => dateOnly(i.updateTime))) ?? gitDate('src/constants/storefrontCategories.ts'),
      inSitemap: list.length > 0,
      priority: '0.8',
      ld: [
        crumbs.ld,
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: cat.title,
          numberOfItems: list.length,
          itemListElement: list.map((i, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            url: abs(productPath(i)),
            name: i.name,
          })),
        },
      ],
      body: `${crumbs.html}<h1>${esc(cat.title)}</h1><p>${esc(cat.description)}</p>${
        list.length ? productList(list) : '<p>New pieces are on the way.</p>'
      }`,
    });
  }

  // Products
  for (const item of products) {
    const cat = storefrontCategoryForItem(item);
    const o = offerFor(item);
    const images = itemImages(item);
    const desc = seo.clampDescription(item.description || `${item.name} from Grapejuice. ${o.note}`);
    const crumbs = breadcrumbs([
      ['Home', '/'],
      ...(cat ? [[cat.title, categoryPath(cat.slug)]] : []),
      [item.name, productPath(item)],
    ]);
    const details = [
      item.brand ? `<li>By ${esc(item.brand)}</li>` : '',
      item.ageGroups.length ? `<li>Ages ${esc(item.ageGroups.join(', '))}</li>` : '',
      item.dimensions ? `<li>Dimensions: ${esc(item.dimensions)}</li>` : '',
      item.materials ? `<li>Materials: ${esc(item.materials)}</li>` : '',
      item.whatsIncluded ? `<li>What's included: ${esc(item.whatsIncluded)}</li>` : '',
    ].join('');
    const priceText =
      o.nonMemberCents && o.memberCents && o.nonMemberCents !== o.memberCents
        ? `${dollars(o.nonMemberCents)} on its own, ${dollars(o.memberCents)} in a box.`
        : o.priceCents
          ? `${dollars(o.priceCents)}.`
          : '';
    page({
      path: productPath(item),
      title: seo.seoTitle(item.name),
      description: desc,
      ogType: 'product',
      image: images[0],
      lastmod: dateOnly(item.updateTime),
      priority: '0.7',
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: item.name,
          description: plain(item.description) || desc,
          ...(images.length ? { image: images } : {}),
          sku: item.sku || item.id,
          brand: { '@type': 'Brand', name: item.brand || seo.SITE_NAME },
          url: abs(productPath(item)),
          ...(cat ? { category: cat.title } : {}),
          ...(o.priceCents
            ? {
                offers: {
                  '@type': 'Offer',
                  url: abs(productPath(item)),
                  priceCurrency: 'USD',
                  price: (o.priceCents / 100).toFixed(2),
                  availability: o.availability,
                  itemCondition: 'https://schema.org/NewCondition',
                  seller: { '@type': 'Organization', name: seo.SITE_NAME },
                  shippingDetails: {
                    '@type': 'OfferShippingDetails',
                    shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'USD' },
                    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
                  },
                },
              }
            : {}),
        },
        crumbs.ld,
      ],
      body: `${crumbs.html}<article><h1>${esc(item.name)}</h1>${
        images[0] ? `<img src="${esc(images[0])}" alt="${esc(item.name)}" width="600" height="600" loading="lazy" />` : ''
      }${item.description ? `<p>${esc(item.description)}</p>` : ''}<p>${esc(priceText)} ${esc(o.note)}</p>${
        details ? `<ul>${details}</ul>` : ''
      }${cat ? `<p><a href="${categoryPath(cat.slug)}">More ${esc(cat.label.toLowerCase())}</a></p>` : ''}</article>`,
    });
  }

  // Our Story
  {
    const s = OUR_STORY_COPY;
    const meta = seo.staticSeoForPath('/story');
    page({
      path: '/story',
      title: meta.title,
      description: meta.description,
      lastmod: gitDate('src/constants/storefrontOurStoryCopy.ts'),
      priority: '0.5',
      ld: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: plain(s.title), url: abs('/story') }],
      body: `<article><h1>${esc(plain(s.title))}</h1><p>${esc(plain(s.lead))}</p>
<section><h2>${esc(plain(s.listening.heading))}</h2>${s.listening.body.map((p) => `<p>${esc(paraText(p))}</p>`).join('')}</section>
<section><h2>${esc(plain(s.beliefs.heading))}</h2>${s.beliefs.sections
        .map(
          (sec) =>
            `<h3>${esc(plain(sec.heading))}</h3><ul>${sec.items
              .map((it) => `<li><strong>${esc(plain(it.title))}</strong>: ${esc(plain(it.body))}</li>`)
              .join('')}</ul>`
        )
        .join('')}</section>
<section><h2>${esc(plain(s.give.heading))}</h2><p>${esc(plain(s.give.body))}</p></section>
<section><h2>${esc(plain(s.team.heading))}</h2><p>${esc(plain(s.team.body))}</p></section></article>`,
    });
  }

  // Legal
  for (const [p, copy, file] of [
    ['/terms', TERMS_COPY, 'src/constants/storefrontTermsCopy.ts'],
    ['/privacy', PRIVACY_COPY, 'src/constants/storefrontPrivacyCopy.ts'],
  ]) {
    const meta = seo.LEGAL_SEO[p];
    page({
      path: p,
      title: meta.title,
      description: meta.description,
      lastmod: gitDate(file),
      priority: '0.2',
      body: `<article><h1>${esc(copy.title)}</h1>${copy.lead.map((l) => `<p>${esc(paraText(l))}</p>`).join('')}${copy.sections
        .map(
          (sec) =>
            `<section>${sec.heading ? `<h2>${esc(plain(sec.heading))}</h2>` : ''}${sec.body
              .map((b) => `<p>${esc(paraText(b))}</p>`)
              .join('')}</section>`
        )
        .join('')}</article>`,
    });
  }

  // Gift
  {
    const meta = seo.staticSeoForPath('/gift');
    page({
      path: '/gift',
      title: meta.title,
      description: meta.description,
      lastmod: gitDate('src/constants/storefrontGiftCopy.ts'),
      priority: '0.8',
      ld: [
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: gift.faq.items.map((q) => ({
            '@type': 'Question',
            name: plain(q.title),
            acceptedAnswer: { '@type': 'Answer', text: plain(q.body) },
          })),
        },
      ],
      body: `<article><h1>${esc(gift.title)}</h1><p>${esc(gift.lead)}</p><p>${esc(gift.smallPrint)}</p>
<section><h2>${esc(gift.twoWays.heading)}</h2><p>${esc(gift.twoWays.body)}</p></section>
<section><h2>${esc(gift.faq.heading)}</h2><dl>${gift.faq.items
        .map((q) => `<dt>${esc(plain(q.title))}</dt><dd>${esc(plain(q.body))}</dd>`)
        .join('')}</dl></section>
<section><h2>${esc(gift.closing.heading)}</h2><p>${esc(gift.closing.body)}</p></section></article>`,
    });
  }

  // Landings
  for (const l of landings) {
    const hero = heroOf(l);
    const sections = (l.sections ?? [])
      .filter((s) => s?.type === 'story' && (s.heading || s.body))
      .map((s) => `<section><h2>${esc(plain(s.heading))}</h2><p>${esc(plain(s.body))}</p></section>`)
      .join('');
    page({
      path: l.path,
      title: seo.seoTitle(hero.headline || l.navLabel),
      description: seo.clampDescription(hero.body || seo.DEFAULT_SEO_DESCRIPTION),
      lastmod: dateOnly(l.updateTime) ?? (l.source ? gitDate(l.source) : null),
      priority: '0.6',
      body: `<article><h1>${esc(hero.headline)}</h1>${hero.body ? `<p>${esc(hero.body)}</p>` : ''}${sections}<p><a href="/store/collection">Browse the Collection</a> or build your box (starting at ${dollars(oneKid)}).</p></article>`,
    });
  }

  // ---------------------------------------------------------------- write HTML
  for (const p of pages) {
    const head = headTags(p);
    const html = template
      .replace(TITLE_TAG, head)
      .replace(ROOT_DIV, `<div id="root"><div id="gj-seo">${siteNav()}<main>${p.body}</main>${footer}</div></div>`);
    const rel = p.path === '/' ? 'index.html' : `${decodeURIComponent(p.path).replace(/^\//, '')}.html`;
    const out = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
  }

  const ogSrc = path.join(ROOT, 'assets/storefront/familysplash2.jpg');
  if (fs.existsSync(ogSrc)) {
    fs.mkdirSync(path.join(DIST, 'og'), { recursive: true });
    fs.copyFileSync(ogSrc, path.join(DIST, HOME_OG_IMAGE));
  }

  // ---------------------------------------------------------------- sitemap / robots / llms
  const sitemapPages = pages.filter((p) => p.inSitemap !== false);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPages
  .map(
    (p) =>
      `  <url><loc>${esc(seo.canonicalUrl(p.path))}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}${
        p.priority ? `<priority>${p.priority}</priority>` : ''
      }</url>`
  )
  .join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);

  const disallow = seo.PRIVATE_PATH_PREFIXES.map((p) => `Disallow: ${p}`).join('\n');
  const AI_BOTS = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-User',
    'Claude-SearchBot',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
  ];
  const robots = `# Grapejuice — ${ORIGIN}
User-agent: *
Allow: /
${disallow}

# AI search and assistant crawlers are welcome.
${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
${disallow}

Sitemap: ${ORIGIN}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robots);

  const summary = `Grapejuice sells curated Hanukkah boxes and Hanukkah goods for culturally Jewish families in the U.S. ${boxLine} It ships free.`;
  const facts = [
    `Price: ${priceLine}`,
    `Hanukkah 2026 dates: ${datesLine}`,
    'Shipping: within the U.S. only (the 50 states and DC).',
    `Gifts: send a curated box or gift credit worth a box at ${ORIGIN}/gift.`,
    'Grapejuice is made by Untraditional, a brand of Unaffiliated Inc. Contact: hello@grapejuice.co.',
  ];
  const link = (href, label, note) => `- [${label}](${abs(href)})${note ? `: ${note}` : ''}`;
  const llms = `# Grapejuice

> ${summary}

${facts.map((f) => `- ${f}`).join('\n')}

## Shop

${STOREFRONT_CATEGORIES.filter((c) => (byCategory.get(c.slug) ?? []).length)
  .map((c) => link(categoryPath(c.slug), c.title, c.description))
  .join('\n')}

## Pages

${[
  link('/gift', 'Give a Hanukkah gift', seo.GIFT_SEO_DESCRIPTION),
  link('/story', 'Our Story', plain(OUR_STORY_COPY.lead)),
  ...landings.map((l) => link(l.path, heroOf(l).headline, heroOf(l).body)),
  link('/terms', 'Terms of Use and Sale'),
  link('/privacy', 'Privacy Policy'),
].join('\n')}

## Optional

- [Full details: every product, the gift FAQ and our story](${ORIGIN}/llms-full.txt)
`;
  fs.writeFileSync(path.join(DIST, 'llms.txt'), llms);

  const productBlock = (i) => {
    const o = offerFor(i);
    const cat = storefrontCategoryForItem(i);
    const lines = [
      `### ${i.name}`,
      abs(productPath(i)),
      o.nonMemberCents && o.memberCents && o.nonMemberCents !== o.memberCents
        ? `Price: ${dollars(o.nonMemberCents)} on its own, ${dollars(o.memberCents)} in a box.`
        : o.priceCents
          ? `Price: ${dollars(o.priceCents)}.`
          : null,
      o.note,
      cat ? `Category: ${cat.title}` : null,
      i.brand ? `By: ${i.brand}` : null,
      i.ageGroups.length ? `Ages: ${i.ageGroups.join(', ')}` : null,
      i.description ? plain(i.description) : null,
    ];
    return lines.filter(Boolean).join('\n');
  };
  const llmsFull = `# Grapejuice

> ${summary}

${facts.map((f) => `- ${f}`).join('\n')}

## How the box works

${boxLine}

${priceLine} ${datesLine} Before the box locks you can add or swap items in it on ${ORIGIN}.

## Gift FAQ

${gift.faq.items.map((q) => `### ${plain(q.title)}\n${plain(q.body)}`).join('\n\n')}

## Our story

${plain(OUR_STORY_COPY.title)}

${plain(OUR_STORY_COPY.lead)}

${OUR_STORY_COPY.listening.body.map(paraText).join('\n\n')}

${plain(OUR_STORY_COPY.team.body)}

## Products

${products.map(productBlock).join('\n\n')}
`;
  fs.writeFileSync(path.join(DIST, 'llms-full.txt'), llmsFull);

  console.log(
    `[build-seo] ${pages.length} pages (${products.length} products, ${landings.length} landings), sitemap ${sitemapPages.length} URLs, robots.txt, llms.txt, llms-full.txt`
  );
}

main().catch((err) => {
  console.error('[build-seo] failed:', err);
  process.exit(1);
});
