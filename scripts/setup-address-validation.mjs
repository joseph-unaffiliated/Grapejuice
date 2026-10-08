/**
 * One-time setup for functions/src/addressValidation.ts: enables the Address Validation API,
 * creates an API key restricted to it, and stores the key as the GOOGLE_ADDRESS_VALIDATION_KEY
 * secret. Uses the local `firebase login` session (no gcloud needed). The key is never printed.
 *
 *   node scripts/setup-address-validation.mjs            # show the current state
 *   node scripts/setup-address-validation.mjs --apply    # enable, create and store what's missing
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';

const PROJECT = 'grapejuice-pilot';
const SERVICE = 'addressvalidation.googleapis.com';
const KEY_ID = 'address-validation-server';
const SECRET = 'GOOGLE_ADDRESS_VALIDATION_KEY';
const apply = process.argv.includes('--apply');

function firebaseCliClient() {
  const storePath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const refreshToken = JSON.parse(readFileSync(storePath, 'utf8')).tokens?.refresh_token;
  const npxRoot = join(homedir(), '.npm', '_npx');
  const apiPath = readdirSync(npxRoot)
    .map((dir) => join(npxRoot, dir, 'node_modules', 'firebase-tools', 'lib', 'api.js'))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!refreshToken || !apiPath) throw new Error('Run `npx firebase-tools login` first.');
  const api = createRequire(import.meta.url)(apiPath);
  const client = new OAuth2Client(api.clientId(), api.clientSecret());
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function call(client, url, { method = 'GET', body } = {}) {
  try {
    const res = await client.request({ url, method, data: body });
    return { status: res.status, data: res.data };
  } catch (err) {
    return { status: err.response?.status ?? 0, data: err.response?.data ?? { error: err.message } };
  }
}

async function waitForOperation(client, base, op) {
  let current = op;
  for (let i = 0; i < 30 && current && !current.done; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    current = (await call(client, `${base}/${current.name}`)).data;
  }
  if (current?.error) throw new Error(`${current.name}: ${JSON.stringify(current.error)}`);
  return current;
}

async function ensureServiceEnabled(client, service) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}`;
  const { data } = await call(client, url);
  if (data.state === 'ENABLED') return console.log(`${service}: enabled`);
  if (!apply) return console.log(`${service}: ${data.state ?? 'unknown'} (run with --apply)`);
  const res = await call(client, `${url}:enable`, { method: 'POST', body: {} });
  if (res.status >= 400) throw new Error(`enable ${service}: ${JSON.stringify(res.data)}`);
  await waitForOperation(client, 'https://serviceusage.googleapis.com/v1', res.data);
  console.log(`${service}: enabled now`);
}

async function ensureKeyString(client) {
  const base = 'https://apikeys.googleapis.com/v2';
  const keyName = `projects/${PROJECT}/locations/global/keys/${KEY_ID}`;
  let key = await call(client, `${base}/${keyName}`);
  if (key.status === 404) {
    if (!apply) return console.log(`API key ${KEY_ID}: missing (run with --apply)`);
    const res = await call(client, `${base}/projects/${PROJECT}/locations/global/keys?keyId=${KEY_ID}`, {
      method: 'POST',
      body: {
        displayName: 'Address Validation (Cloud Functions)',
        restrictions: { apiTargets: [{ service: SERVICE }] },
      },
    });
    if (res.status >= 400) throw new Error(`create key: ${JSON.stringify(res.data)}`);
    await waitForOperation(client, base, res.data);
    key = await call(client, `${base}/${keyName}`);
    console.log(`API key ${KEY_ID}: created, restricted to ${SERVICE}`);
  } else if (key.status >= 400) {
    throw new Error(`get key: ${JSON.stringify(key.data)}`);
  } else {
    const targets = key.data.restrictions?.apiTargets?.map((t) => t.service).join(', ') || 'none';
    console.log(`API key ${KEY_ID}: exists (restricted to ${targets})`);
  }
  const { data } = await call(client, `${base}/${keyName}/keyString`);
  return data.keyString;
}

async function ensureSecret(client, keyString) {
  const base = `https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets`;
  const secret = await call(client, `${base}/${SECRET}`);
  if (secret.status === 404) {
    if (!apply) return console.log(`Secret ${SECRET}: missing (run with --apply)`);
    const res = await call(client, `${base}?secretId=${SECRET}`, {
      method: 'POST',
      body: { replication: { automatic: {} }, labels: { 'firebase-managed': 'true' } },
    });
    if (res.status >= 400) throw new Error(`create secret: ${JSON.stringify(res.data)}`);
  } else if (secret.status >= 400) {
    throw new Error(`get secret: ${JSON.stringify(secret.data)}`);
  }
  const versions = await call(client, `${base}/${SECRET}/versions?filter=state:ENABLED`);
  if (versions.data.versions?.length) return console.log(`Secret ${SECRET}: has an enabled version`);
  if (!apply || !keyString) return console.log(`Secret ${SECRET}: no enabled version (run with --apply)`);
  const res = await call(client, `${base}/${SECRET}:addVersion`, {
    method: 'POST',
    body: { payload: { data: Buffer.from(keyString, 'utf8').toString('base64') } },
  });
  if (res.status >= 400) throw new Error(`add secret version: ${JSON.stringify(res.data)}`);
  console.log(`Secret ${SECRET}: version stored`);
}

const client = firebaseCliClient();
await ensureServiceEnabled(client, 'apikeys.googleapis.com');
await ensureServiceEnabled(client, 'secretmanager.googleapis.com');
await ensureServiceEnabled(client, SERVICE);
const keyString = await ensureKeyString(client);
await ensureSecret(client, keyString);
