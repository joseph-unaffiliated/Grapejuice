/**
 * Firestore client authenticated with the local `firebase login` session, for machines where
 * gcloud application-default credentials aren't available. Nothing is printed or written.
 * firebase-admin's Firestore only accepts service-account or ADC credentials, so this uses
 * @google-cloud/firestore directly.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Firestore } from '@google-cloud/firestore';

function findFirebaseToolsApi() {
  const npxRoot = join(homedir(), '.npm', '_npx');
  if (!existsSync(npxRoot)) return null;
  const candidates = readdirSync(npxRoot)
    .map((dir) => join(npxRoot, dir, 'node_modules', 'firebase-tools', 'lib', 'api.js'))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

export function firestoreFromFirebaseCliLogin(projectId) {
  const storePath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!existsSync(storePath)) return null;
  const refreshToken = JSON.parse(readFileSync(storePath, 'utf8')).tokens?.refresh_token;
  const apiPath = findFirebaseToolsApi();
  if (!refreshToken || !apiPath) return null;
  const api = createRequire(import.meta.url)(apiPath);
  return new Firestore({
    projectId,
    credentials: {
      type: 'authorized_user',
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
      refresh_token: refreshToken,
    },
  });
}
