/**
 * Create the conversion-program discount codes if they are missing.
 * Sets FIFTEENOFF's end date when an existing code has none.
 */
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
if (!db) {
  console.error('No Firebase CLI login');
  process.exit(1);
}

const codes = [
  ['FIFTEENOFF', 15, null, '2026-11-05T04:59:59.000Z', 'The 15% version of TENOFF. One code for every newsletter. One per account. Ends 11:59pm ET Nov 4.', true, false],
  ['S1TWENTY', 20, '2026-10-25T04:00:00.000Z', '2026-10-29T03:59:59.000Z', 'Reserve. Inactive unless the 15% wave is short. Not for a broadcast.', false, false],
];

const now = new Date().toISOString();
let created = 0;
for (const [code, percentOff, startsAt, endsAt, note, active, freeShipping] of codes) {
  const ref = db.doc(`discountCodes/${code}`);
  const snap = await ref.get();
  if (snap.exists) {
    if (code === 'FIFTEENOFF' && endsAt && snap.data()?.endsAt == null) {
      await ref.set({ endsAt, note, updatedAt: now }, { merge: true });
      console.log('endsAt set', code);
    } else {
      console.log('exists', code);
    }
    continue;
  }
  await ref.set({
    code,
    percentOff,
    amountOffCents: null,
    freeShipping,
    startsAt,
    endsAt,
    maxRedemptions: null,
    onePerAccount: true,
    active,
    note,
    createdAt: now,
    createdByEmail: 'program',
    updatedAt: now,
  });
  created += 1;
  console.log('created', code);
}

await db.doc('adminConfig/programMeta').set(
  {
    broadCampaignId: '120247675198020519',
    broadDailyBudgetCents: 25000,
    keptAdSets: [
      'Broad - convenient-v2',
      'Broad - beautiful-v2',
      'Broad - first-hanukkah-v1',
      'Broad - convenient-v1',
      'Broad - affordable-v1',
      'Broad - customizable-v1',
      'Broad - both-holidays-v1',
    ],
    networkAudienceId: '120248082517320519',
    lookalikeAudienceId: '120248082517550519',
    followUpCampaignId: '120247895235230519',
    grandparentCampaignId: '120247861812310519',
    updatedAt: now,
  },
  { merge: true }
);
console.log(JSON.stringify({ created }));
