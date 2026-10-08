/**
 * One-time IAM setup for functions/src/loginLinks.ts: `createCustomToken` signs with the functions
 * runtime service account via iam.serviceAccounts.signBlob, which needs "Service Account Token
 * Creator" on that account. Uses the local `firebase login` session (no gcloud needed).
 *
 *   node scripts/grant-token-creator.mjs            # show the current state
 *   node scripts/grant-token-creator.mjs --apply    # add the binding if missing
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';

const PROJECT = 'grapejuice-pilot';
const REGION = 'us-central1';
/** Any deployed 2nd-gen function — they all share the runtime service account. */
const PROBE_FUNCTION = 'saveGuestSession';
const ROLE = 'roles/iam.serviceAccountTokenCreator';

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

async function call(client, url, body) {
  const res = await client.request({ url, method: body ? 'POST' : 'GET', data: body });
  return res.data;
}

const client = firebaseCliClient();
const fn = await call(
  client,
  `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions/${PROBE_FUNCTION}`
);
const sa = fn.serviceConfig?.serviceAccountEmail;
if (!sa) throw new Error('Could not read the functions runtime service account.');
console.log('Runtime service account:', sa);

const resource = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${sa}`;
const policy = await call(client, `${resource}:getIamPolicy`, {});
const member = `serviceAccount:${sa}`;
const bindings = policy.bindings ?? [];
const existing = bindings.find((b) => b.role === ROLE);
if (existing?.members?.includes(member)) {
  console.log('Token Creator already granted.');
  process.exit(0);
}
if (!process.argv.includes('--apply')) {
  console.log('Token Creator NOT granted. Re-run with --apply to add it.');
  process.exit(0);
}
if (existing) existing.members.push(member);
else bindings.push({ role: ROLE, members: [member] });
await call(client, `${resource}:setIamPolicy`, { policy: { ...policy, bindings } });
console.log('Granted Token Creator on itself.');
