#!/usr/bin/env node
/**
 * Lists who would get the kosher note, and which version, without sending.
 * Writes the list to /tmp/kosher-notice-dry-run.txt. Prints counts only.
 *
 *   node scripts/kosher-notice-dry-run.mjs
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const require = createRequire(import.meta.url);
require('sucrase/register/ts');
const { edibleFoodLines, kosherNoticeVersion, mentionsKeepingKosher } = require('../functions/src/kosherNotice.ts');
const { isTest } = require('../functions/src/testAccounts.ts');

const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
if (!db) {
  console.error('No usable firebase login session.');
  process.exit(1);
}

const [users, drafts, chats] = await Promise.all([
  db.collection('users').select('email', 'ravNotes', 'lastBoxAnswers', 'householdId').get(),
  db.collectionGroup('boxDrafts').get(),
  db.collectionGroup('aiChats').select('messages').get(),
]);

const ravByUid = new Map();
for (const doc of chats.docs) {
  const uid = doc.ref.parent.parent?.id;
  if (!uid || doc.ref.parent.id !== 'aiChats' || ravByUid.has(uid)) continue;
  const msgs = doc.data().messages;
  if (!Array.isArray(msgs)) continue;
  const text = msgs
    .filter((m) => m && m.role !== 'assistant')
    .map((m) => String(m.content ?? ''))
    .join('\n');
  if (mentionsKeepingKosher(text)) ravByUid.set(uid, text);
}

const draftByHousehold = new Map();
for (const doc of drafts.docs) {
  const hh = doc.ref.parent.parent;
  if (doc.id !== 'hanukkah-2026' || hh?.parent.id !== 'households') continue;
  draftByHousehold.set(hh.id, doc.data().lineItems);
}

const lines = [];
const counts = { with_food: 0, already_out: 0 };
for (const user of users.docs) {
  const data = user.data();
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!email || isTest(email)) continue;
  const answers = data.lastBoxAnswers ?? {};
  const practice = typeof answers.practiceFrequencyScore === 'number' ? answers.practiceFrequencyScore : null;
  const hid = typeof data.householdId === 'string' ? data.householdId : '';
  const foods = edibleFoodLines(Array.isArray(draftByHousehold.get(hid)) ? draftByHousehold.get(hid) : []);
  const version = kosherNoticeVersion({
    householdNote: typeof data.ravNotes === 'string' ? data.ravNotes : '',
    ravText: ravByUid.get(user.id) ?? '',
    practiceScore: practice,
    practiceTouched: practice != null && practice !== 50,
    edibleNames: foods.map((f) => f.name),
  });
  if (!version) continue;
  counts[version] += 1;
  lines.push(`${version}\t${email}`);
}

const out = '/tmp/kosher-notice-dry-run.txt';
writeFileSync(out, lines.sort().join('\n') + (lines.length ? '\n' : ''));
console.log(JSON.stringify({ ...counts, listed: lines.length, file: out }));
