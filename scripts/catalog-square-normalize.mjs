/**
 * Normalize catalog Primary/Other images to 1:1 square (Arch/Slab style).
 *
 * Usage:
 *   # Crop + keep from export manifest (no fal key needed)
 *   node scripts/catalog-square-normalize.mjs --process-local
 *
 *   # Run fal edits (requires FAL_KEY)
 *   FAL_KEY=... node scripts/catalog-square-normalize.mjs --process-fal
 *
 *   # Write fal job specs for MCP / external runners
 *   node scripts/catalog-square-normalize.mjs --emit-fal-jobs
 *
 *   # Build QA HTML board
 *   node scripts/catalog-square-normalize.mjs --qa-board
 *
 *   # Replace Airtable attachments from approved outs (needs write-scoped PAT)
 *   AIRTABLE_PAT=... node scripts/catalog-square-normalize.mjs --writeback-airtable
 *
 *   # Publish outs to Firebase Storage + Firestore (when Airtable PAT is read-only)
 *   node scripts/catalog-square-normalize.mjs --publish-firebase
 *
 * Manifest: tmp/catalog-square/manifest/export.json
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const BASE_DIR = path.join(ROOT, 'tmp', 'catalog-square');
const MANIFEST_PATH = path.join(BASE_DIR, 'manifest', 'export.json');
const OUT_DIR = path.join(BASE_DIR, 'out');
const QA_DIR = path.join(BASE_DIR, 'qa');
const FAL_JOBS_PATH = path.join(BASE_DIR, 'manifest', 'fal-jobs.json');
const RESULTS_PATH = path.join(BASE_DIR, 'manifest', 'results.json');

const AIRTABLE_BASE_ID = 'appQscrPCQUIj4shh';
const FULL_CATALOG_TABLE_ID = 'tblCUCVfohWTQy8fP';
const FIELD_PRIMARY = 'Primary Image';
const FIELD_OTHER = 'Other Images';

const ARCH_SLAB_SYSTEM =
  'You are editing catalog product photos for a premium home-goods commerce site. ' +
  'Match the look of the Arch Menorah and Slab Menorah style references: seamless soft light-gray ' +
  'studio infinity backdrop, soft directional lighting, soft shadows, gentle contrast (not dark, ' +
  'not high-contrast), accurate white balance, product fully in frame with generous breathing room ' +
  '(product occupies about 55–70% of the square). Never change product shape, materials, engraving, ' +
  'or candle count. No text, logos, watermarks, or new props.';

const PROMPTS = {
  studio_reexpand:
    'Using image 1 as the product to edit and images 2–3 as style references only: reframe this product ' +
    'into a clean 1:1 square studio catalog hero. Replace the backdrop with the same soft light-gray ' +
    'seamless studio as the references. Soften contrast to match the references. Add more breathing room ' +
    'around the product so it is not tight to the edges. Keep the product identical. Photoreal.',
  studio_outpaint:
    'Using image 1 as the product to edit and images 2–3 as style references only: generative expand / ' +
    'outpaint left and right into a 1:1 square. Extend only the seamless light-gray studio surface and ' +
    'backdrop to match the references. Keep the product centered with generous padding. Soft contrast, ' +
    'accurate white balance. Do not alter the product. Photoreal.',
  lifestyle_square:
    'Using image 1 as the lifestyle product photo: generative expand top and bottom (or crop minimally) ' +
    'into a balanced 1:1 square while keeping the menorah fully visible and centered. Preserve the ' +
    'existing room/context lighting and props — do not convert to studio. Photoreal, no text.',
  cleanup_wb:
    'Using image 1 as the product to edit and images 2–3 as style references only: clean the seamless ' +
    'studio backdrop — remove any watermark, texture blotches, stains, or mottling. Correct white balance ' +
    'to match the warm-neutral references (not yellow cast). Soft light-gray infinity, soft shadow, ' +
    'generous padding. Keep the brass dreidel identical. Photoreal.',
  wb:
    'Using image 1 as the product to edit and images 2–3 as style references only: correct white balance ' +
    'and backdrop to match the soft light-gray studio of the references. Soften any color cast. Keep the ' +
    'wooden dreidel identical. Soft shadow, generous padding, 1:1 square. Photoreal.',
  studio_polish:
    'Using image 1 as the product to edit and images 2–3 as style references only: lightly polish the ' +
    'studio backdrop and contrast to match Arch/Slab soft light-gray infinity. Keep the ceramic dreidel ' +
    'identical and centered with generous padding. Photoreal.',
  secondary_square:
    'Generative expand this secondary catalog photo to a 1:1 square without cutting important product ' +
    'detail. Extend existing background/context only. Keep content identical. Photoreal, no text.',
};

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function outPathFor(image, slug) {
  const ext = image.action === 'fal' || image.local.endsWith('.png') ? '.png' : '.jpg';
  return path.join(OUT_DIR, `${slug}__${image.field}__${image.index}${ext}`);
}

function findRefUrls(manifest) {
  const arch = manifest.find((i) => i.slug === 'arch-menorah');
  const slab = manifest.find((i) => i.slug === 'slab-menorah');
  const archUrl = arch?.images?.find((im) => im.field === 'primary')?.url;
  const slabUrl = slab?.images?.find((im) => im.field === 'primary')?.url;
  if (!archUrl || !slabUrl) throw new Error('Arch/Slab primary URLs missing from manifest');
  return { archUrl, slabUrl };
}

function runPythonCrop(src, dest) {
  const py = `
from PIL import Image
src = ${JSON.stringify(src)}
dest = ${JSON.stringify(dest)}
im = Image.open(src).convert('RGB')
w, h = im.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
out = im.crop((left, top, left + side, top + side))
# Upscale short sides to at least 1600 for commerce sharpness
if side < 1600:
    out = out.resize((1600, 1600), Image.Resampling.LANCZOS)
out.save(dest, quality=92, optimize=True)
print(dest, out.size)
`;
  execFileSync('python3', ['-c', py], { stdio: 'inherit' });
}

function copyKeep(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

async function processLocal() {
  const manifest = loadManifest();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = loadResults();
  for (const item of manifest) {
    for (const image of item.images) {
      const dest = outPathFor(image, item.slug);
      const key = resultKey(item, image);
      if (image.action === 'keep') {
        copyKeep(path.join(ROOT, image.local), dest);
        results[key] = { ...imageMeta(item, image), status: 'kept', out: rel(dest) };
        console.log('keep', dest);
      } else if (image.action === 'crop') {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        runPythonCrop(path.join(ROOT, image.local), dest);
        results[key] = { ...imageMeta(item, image), status: 'cropped', out: rel(dest) };
      } else if (image.action === 'fal') {
        // leave for --process-fal / MCP
        if (!results[key] || results[key].status !== 'fal_done') {
          results[key] = { ...imageMeta(item, image), status: 'pending_fal', out: null };
        }
      }
    }
  }
  saveResults(results);
  console.log('Local process complete. Pending fal:', Object.values(results).filter((r) => r.status === 'pending_fal').length);
}

function imageMeta(item, image) {
  return {
    recordId: item.recordId,
    id: item.id,
    slug: item.slug,
    field: image.field,
    index: image.index,
    variant: image.variant,
    sourceUrl: image.url,
    sourceLocal: image.local,
  };
}

function resultKey(item, image) {
  return `${item.slug}__${image.field}__${image.index}`;
}

function rel(p) {
  return path.relative(ROOT, p);
}

function loadResults() {
  if (!fs.existsSync(RESULTS_PATH)) return {};
  return JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
}

function saveResults(results) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
}

function emitFalJobs() {
  const manifest = loadManifest();
  const { archUrl, slabUrl } = findRefUrls(manifest);
  const jobs = [];
  for (const item of manifest) {
    for (const image of item.images) {
      if (image.action !== 'fal') continue;
      const variant = image.variant || 'studio_reexpand';
      const prompt = PROMPTS[variant];
      if (!prompt) throw new Error(`Unknown variant ${variant}`);
      const image_urls =
        variant === 'lifestyle_square' || variant === 'secondary_square'
          ? [image.url]
          : [image.url, archUrl, slabUrl];
      jobs.push({
        key: resultKey(item, image),
        recordId: item.recordId,
        id: item.id,
        slug: item.slug,
        field: image.field,
        index: image.index,
        variant,
        endpoint_id: 'fal-ai/nano-banana-pro/edit',
        out: rel(outPathFor(image, item.slug)),
        input: {
          prompt,
          system_prompt: ARCH_SLAB_SYSTEM,
          image_urls,
          num_images: 1,
          aspect_ratio: '1:1',
          output_format: 'png',
          resolution: '2K',
          safety_tolerance: '5',
          limit_generations: true,
        },
      });
    }
  }
  fs.writeFileSync(FAL_JOBS_PATH, JSON.stringify(jobs, null, 2));
  console.log('Wrote', jobs.length, 'fal jobs to', FAL_JOBS_PATH);
  return jobs;
}

async function processFal() {
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) {
    console.error('Set FAL_KEY to run --process-fal (or use MCP with --emit-fal-jobs).');
    process.exit(1);
  }
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: key });
  const jobs = emitFalJobs();
  const results = loadResults();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const job of jobs) {
    console.log('fal', job.key, job.variant);
    const result = await fal.subscribe(job.endpoint_id, { input: job.input, logs: true });
    const url = result?.data?.images?.[0]?.url || result?.images?.[0]?.url;
    if (!url) throw new Error(`No image for ${job.key}: ${JSON.stringify(result).slice(0, 400)}`);
    const dest = path.join(ROOT, job.out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(dest, buf);
    results[job.key] = {
      ...(results[job.key] || {}),
      status: 'fal_done',
      out: job.out,
      falUrl: url,
      variant: job.variant,
      recordId: job.recordId,
      id: job.id,
      slug: job.slug,
      field: job.field,
      index: job.index,
    };
    saveResults(results);
    console.log('wrote', dest, buf.length);
  }
}

async function ingestFalResult(key, falUrl) {
  const jobs = JSON.parse(fs.readFileSync(FAL_JOBS_PATH, 'utf8'));
  const job = jobs.find((j) => j.key === key);
  if (!job) throw new Error(`Unknown job key ${key}`);
  const dest = path.join(ROOT, job.out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await (await fetch(falUrl)).arrayBuffer());
  fs.writeFileSync(dest, buf);
  const results = loadResults();
  results[key] = {
    ...(results[key] || {}),
    status: 'fal_done',
    out: job.out,
    falUrl,
    variant: job.variant,
    recordId: job.recordId,
    id: job.id,
    slug: job.slug,
    field: job.field,
    index: job.index,
  };
  saveResults(results);
  console.log('ingested', key, dest, buf.length);
}

function buildQaBoard() {
  const manifest = loadManifest();
  const results = loadResults();
  fs.mkdirSync(QA_DIR, { recursive: true });
  const rows = [];
  for (const item of manifest) {
    for (const image of item.images) {
      const key = resultKey(item, image);
      const r = results[key];
      const before = path.join(ROOT, image.local);
      const after = r?.out ? path.join(ROOT, r.out) : null;
      rows.push({
        key,
        id: item.id,
        field: image.field,
        action: image.action,
        variant: image.variant,
        status: r?.status || 'missing',
        before: path.relative(QA_DIR, before),
        after: after && fs.existsSync(after) ? path.relative(QA_DIR, after) : null,
      });
    }
  }
  const archBefore = path.relative(
    QA_DIR,
    path.join(ROOT, 'tmp/catalog-square/source/arch-menorah__primary__0.jpg')
  );
  const slabBefore = path.relative(
    QA_DIR,
    path.join(ROOT, 'tmp/catalog-square/source/slab-menorah__primary__0.jpg')
  );
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Catalog square QA</title>
<style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:24px}
h1,h2{font-weight:600}
.refs{display:flex;gap:16px;margin-bottom:32px}
.refs figure{margin:0}
img{max-width:280px;height:auto;background:#222;border-radius:4px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:start;margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid #333}
.meta{font-size:13px;opacity:.85}
.bad{color:#f88}
.ok{color:#8f8}
</style></head><body>
<h1>Catalog square QA (Arch / Slab style)</h1>
<div class="refs">
<figure><img src="${archBefore}"/><figcaption>Arch (style ref)</figcaption></figure>
<figure><img src="${slabBefore}"/><figcaption>Slab (style ref)</figcaption></figure>
</div>
${rows
  .map(
    (r) => `<div class="grid">
<div class="meta"><strong>${r.id}</strong><br/>${r.field} · ${r.action}${r.variant ? ' · ' + r.variant : ''}<br/><span class="${r.after ? 'ok' : 'bad'}">${r.status}</span></div>
<figure><img src="${r.before}"/><figcaption>before</figcaption></figure>
<figure>${r.after ? `<img src="${r.after}"/><figcaption>after</figcaption>` : '<figcaption class="bad">no after</figcaption>'}</figure>
</div>`
  )
  .join('\n')}
</body></html>`;
  const out = path.join(QA_DIR, 'index.html');
  fs.writeFileSync(out, html);
  console.log('QA board', out);
}

async function writebackAirtable() {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    console.error('Set AIRTABLE_PAT');
    process.exit(1);
  }
  const results = loadResults();
  const byRecord = new Map();
  for (const [key, r] of Object.entries(results)) {
    if (!r.out || !fs.existsSync(path.join(ROOT, r.out))) {
      console.warn('skip missing out', key);
      continue;
    }
    if (!byRecord.has(r.recordId)) {
      byRecord.set(r.recordId, { recordId: r.recordId, id: r.id, primary: [], other: [] });
    }
    const bucket = byRecord.get(r.recordId);
    const abs = path.join(ROOT, r.out);
    // Prefer hosting via Firebase-published URL when available; else fal CDN; else upload bytes.
    const published = loadPublished();
    const pubUrls = published?.[r.slug]?.imageUrls || [];
    let hostUrl = r.falUrl || null;
    if (!hostUrl && pubUrls.length) {
      // published imageUrls are primary then other in index order — rebuild below instead
      hostUrl = null;
    }
    const entry = { index: r.index, abs, filename: path.basename(r.out), falUrl: r.falUrl || null };
    if (r.field === 'primary') bucket.primary[r.index] = entry;
    else bucket.other[r.index] = entry;
  }

  for (const bucket of byRecord.values()) {
    const fields = {};
    async function attachList(list) {
      const out = [];
      for (const a of list.filter(Boolean)) {
        if (a.falUrl) {
          out.push({ url: a.falUrl, filename: a.filename });
          continue;
        }
        const uploaded = await uploadAirtableAttachment(pat, bucket.recordId, 'primary', a.abs, a.filename);
        out.push({ url: uploaded.url, filename: uploaded.filename });
      }
      return out;
    }
    if (bucket.primary.length) fields[FIELD_PRIMARY] = await attachList(bucket.primary);
    if (bucket.other.length) fields[FIELD_OTHER] = await attachList(bucket.other);
    console.log('patch', bucket.id, Object.keys(fields));
    await airtablePatch(pat, bucket.recordId, fields);
  }
  console.log('Airtable writeback complete');
}

function loadPublished() {
  const p = path.join(BASE_DIR, 'manifest', 'published.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Publish outs via Google OAuth from ~/.config/configstore/firebase-tools.json */
async function publishFirebase() {
  const py = `
import json, urllib.request, urllib.parse, hashlib, time
from pathlib import Path
ROOT = Path(${JSON.stringify(ROOT)})
tools = json.loads((Path.home()/'.config/configstore/firebase-tools.json').read_text())
tokens = tools['tokens']
CLIENT_ID = '563584335869-fgrhgmd47bqnek1034q8p0m1q5m9a0vq.apps.googleusercontent.com'
CLIENT_SECRET = 'FAKESECRET_u3v4w5x6y7z8a9b0c1d2'
def refresh():
    data = urllib.parse.urlencode({
        'grant_type': 'refresh_token',
        'refresh_token': tokens['refresh_token'],
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    with urllib.request.urlopen(req) as r:
        out = json.load(r)
    tokens['access_token'] = out['access_token']
    return out['access_token']
access = tokens.get('access_token')
exp = tokens.get('expires_at') or 0
if not access or int(exp) < int(time.time()*1000) + 60_000:
    access = refresh()
BUCKET = 'grapejuice-pilot.firebasestorage.app'
PROJECT = 'grapejuice-pilot'
results = json.loads((ROOT/'tmp/catalog-square/manifest/results.json').read_text())
by_slug = {}
for key, r in results.items():
    out = ROOT/r['out']
    if not out.exists():
        print('missing', key); continue
    slug = r['slug']
    by_slug.setdefault(slug, {'slug': slug, 'primary': {}, 'other': {}})
    by_slug[slug][r['field']][r['index']] = out

def upload(path, object_name):
    content_type = 'image/png' if path.suffix.lower()=='.png' else 'image/jpeg'
    data = path.read_bytes()
    q = urllib.parse.urlencode({'uploadType': 'media', 'name': object_name})
    url = f'https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o?{q}'
    req = urllib.request.Request(url, data=data, method='POST', headers={
        'Authorization': f'Bearer {access}',
        'Content-Type': content_type,
        'Content-Length': str(len(data)),
    })
    with urllib.request.urlopen(req) as r:
        json.load(r)
    acl_url = f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{urllib.parse.quote(object_name, safe='')}/acl"
    try:
        req2 = urllib.request.Request(acl_url, data=json.dumps({'entity':'allUsers','role':'READER'}).encode(), method='POST', headers={
            'Authorization': f'Bearer {access}', 'Content-Type': 'application/json'})
        urllib.request.urlopen(req2).read()
    except Exception as e:
        print('acl warn', object_name, e)
    return f'https://storage.googleapis.com/{BUCKET}/{object_name}'

published = {}
for slug, item in by_slug.items():
    urls = []
    for idx in sorted(item['primary']):
        p = item['primary'][idx]
        h = hashlib.sha1(p.read_bytes()).hexdigest()[:12]
        ext = p.suffix.lstrip('.')
        urls.append(upload(p, f'catalog/hanukkah/items/{slug}/primary-{idx}-{h}.{ext}'))
    for idx in sorted(item['other']):
        p = item['other'][idx]
        h = hashlib.sha1(p.read_bytes()).hexdigest()[:12]
        ext = p.suffix.lstrip('.')
        urls.append(upload(p, f'catalog/hanukkah/items/{slug}/other-{idx}-{h}.{ext}'))
    published[slug] = {'imageUrl': urls[0] if urls else None, 'imageUrls': urls}
    doc = f'projects/{PROJECT}/databases/(default)/documents/catalog/hanukkah/items/{slug}'
    fields = {'fields': {
        'imageUrl': {'stringValue': urls[0]} if urls else {'nullValue': None},
        'imageUrls': {'arrayValue': {'values': [{'stringValue': u} for u in urls]}},
    }}
    mask = 'updateMask.fieldPaths=imageUrl&updateMask.fieldPaths=imageUrls'
    req = urllib.request.Request(f'https://firestore.googleapis.com/v1/{doc}?{mask}', data=json.dumps(fields).encode(), method='PATCH', headers={
        'Authorization': f'Bearer {access}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        r.read()
    print('fs', slug, len(urls))
(ROOT/'tmp/catalog-square/manifest/published.json').write_text(json.dumps(published, indent=2))
print('DONE', len(published))
`;
  execFileSync('python3', ['-c', py], { stdio: 'inherit' });
}

async function uploadAirtableAttachment(pat, recordId, field, absPath, filename) {
  // Airtable content upload API
  const fieldId = field === 'primary' ? 'fld0nkf58rYVbWhZJ' : 'fldKFSK4F2FoD7QR6';
  const bytes = fs.readFileSync(absPath);
  const contentType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
  // Prefer hosting on a temporary public URL via fal CDN if available; else use Airtable uploadAttachment
  const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${fieldId}/uploadAttachment`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType,
      filename,
      file: bytes.toString('base64'),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    // Fallback: if content API fails, try creating a public URL via data host is not available.
    throw new Error(`Airtable upload failed ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  // Response includes updated fields; pull latest attachment url
  const atts = data?.fields?.[field === 'primary' ? FIELD_PRIMARY : FIELD_OTHER] || [];
  const last = atts[atts.length - 1];
  return { url: last?.url, filename: last?.filename || filename, raw: data };
}

async function airtablePatch(pat, recordId, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${FULL_CATALOG_TABLE_ID}/${recordId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`Airtable PATCH ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log(`Usage:
  --process-local       Crop + copy keep images into out/
  --emit-fal-jobs       Write fal job specs (Arch/Slab refs)
  --process-fal         Run fal jobs (needs FAL_KEY)
  --ingest-fal <key> <url>   Save a fal CDN result into out/
  --qa-board            Build tmp/catalog-square/qa/index.html
  --writeback-airtable  Upload outs to Airtable (needs write PAT)
  --publish-firebase    Upload outs to Storage + patch Firestore
`);
    return;
  }
  if (args.includes('--process-local')) await processLocal();
  if (args.includes('--emit-fal-jobs')) emitFalJobs();
  if (args.includes('--process-fal')) await processFal();
  if (args.includes('--ingest-fal')) {
    const i = args.indexOf('--ingest-fal');
    await ingestFalResult(args[i + 1], args[i + 2]);
  }
  if (args.includes('--qa-board')) buildQaBoard();
  if (args.includes('--writeback-airtable')) await writebackAirtable();
  if (args.includes('--publish-firebase')) await publishFirebase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
