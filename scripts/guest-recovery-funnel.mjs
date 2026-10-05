#!/usr/bin/env node
/**
 * Guest box recovery funnel (Firestore side) — counts only, no PII.
 *
 *   node scripts/guest-recovery-funnel.mjs [--days 7]
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`,
 * project grapejuice-pilot (override with FIREBASE_PROJECT_ID).
 *
 * BigQuery side (lead intake + forward status) lives in docs/GUEST_BOX_RECOVERY.md.
 * Single-field range queries only, so no composite indexes are needed; the breakdowns are
 * computed in memory (these collections stay small — 60-day TTL).
 */
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const daysArg = args.indexOf('--days');
const days = daysArg >= 0 ? Number(args[daysArg + 1]) || 7 : 7;
const since = admin.firestore.Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot' });
const db = admin.firestore();

async function windowDocs(collection, field, ...select) {
  const snap = await db.collection(collection).where(field, '>=', since).select(...select).get();
  return snap.docs.map((d) => d.data());
}

const sessions = await windowDocs('guestSessions', 'createdAt', 'hasBox', 'hasGiftDraft', 'convertedUid', 'resumeCount');
const leads = await windowDocs('retentionLeadEvents', 'receivedAt', 'linked', 'hasBox', 'eventSent', 'status', 'replayed');
const tokens = await windowDocs('guestResumeTokens', 'createdAt', 'usedCount');

const n = (arr, pred = () => true) => arr.filter(pred).length;

const rows = [
  ['Guest sessions saved', n(sessions)],
  ['  …with a box', n(sessions, (s) => s.hasBox === true)],
  ['  …with a gift draft', n(sessions, (s) => s.hasGiftDraft === true)],
  ['  …converted to accounts', n(sessions, (s) => !!s.convertedUid)],
  ['  …resumed from an email link', n(sessions, (s) => (s.resumeCount ?? 0) > 0)],
  ['Retention leads received', n(leads)],
  ['  …replayed by the cron', n(leads, (l) => l.replayed === true)],
  ['  …linked by gjv', n(leads, (l) => l.linked === 'gjv')],
  ['  …linked by clicked_at fallback', n(leads, (l) => l.linked === 'clicked_at')],
  ['  …not linked', n(leads, (l) => !l.linked)],
  ['  …with a box (resume link minted)', n(leads, (l) => l.hasBox === true)],
  ['  …campaign event sent', n(leads, (l) => l.eventSent === true)],
  ['  …Customer.io failures', n(leads, (l) => l.status === 'cio_failed')],
  ['Resume links minted', n(tokens)],
  ['  …opened at least once', n(tokens, (t) => (t.usedCount ?? 0) > 0)],
];

console.log(`Guest box recovery — last ${days} day(s)`);
for (const [label, value] of rows) console.log(`${label.padEnd(40)} ${String(value).padStart(6)}`);
