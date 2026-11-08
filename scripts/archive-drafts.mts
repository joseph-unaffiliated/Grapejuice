/**
 * Copy every unfinished Hanukkah box into boxDraftArchives without changing the live drafts.
 * Run: npx tsx scripts/archive-drafts.mts
 */
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';
import { PRE_LOCK_CAPTURE_ID, archiveDraftBoxes } from '../functions/src/program/draftArchive.ts';

const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
if (!db) {
  console.error('No Firebase CLI login available for grapejuice-pilot.');
  process.exit(1);
}

const result = await archiveDraftBoxes(db, { captureId: PRE_LOCK_CAPTURE_ID, wishlist: false });
console.log(JSON.stringify(result));
