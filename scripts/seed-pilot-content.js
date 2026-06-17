/**
 * Seed pilot Firestore: content/nights (1–8) + config/hanukkah-2026.
 * Run: npm run seed:pilot-content
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default login
 */
const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'grapejuice-pilot';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

const LOCK_AT = '2026-11-07T05:00:00.000Z'; // 14 days before estimated delivery — Eastern interpret in ops
const EXPEDITED_LOCK_AT = '2026-11-14T05:00:00.000Z'; // ~7 days after standard lock
const HANUKKAH_START = '2026-12-05';
const ESTIMATED_DELIVERY_BY = '2026-11-21'; // 14 days before Hanukkah start

const nights = [
  { night: 1, title: 'Night 1', suggestion: 'Light the first candle. Use the lyric sheet in your box — try singing together.', songTitle: 'Maoz Tzur', storySnippet: 'A small start counts.' },
  { night: 2, title: 'Night 2', suggestion: 'Keep it short: candles, one song, bedtime.', songTitle: '', storySnippet: '' },
  { night: 3, title: 'Night 3', suggestion: 'Add a story from the book we packed for your kid.', songTitle: '', storySnippet: '' },
  { night: 4, title: 'Night 4', suggestion: 'Traditionally a bigger night — go a little bigger if you have energy.', songTitle: '', storySnippet: '' },
  { night: 5, title: 'Night 5', suggestion: 'Dreidel night if you have little kids.', songTitle: '', storySnippet: '' },
  { night: 6, title: 'Night 6', suggestion: 'Latke kit night — sour cream and applesauce are on you.', songTitle: '', storySnippet: '' },
  { night: 7, title: 'Night 7', suggestion: 'Replay a favorite song from earlier in the week.', songTitle: '', storySnippet: '' },
  { night: 8, title: 'Night 8', suggestion: 'Last night — candles, gratitude, whatever felt good this year.', songTitle: '', storySnippet: '' },
];

async function main() {
  const batch = db.batch();

  const holidayDoc = 'hanukkah-2026';
  for (const n of nights) {
    const ref = db.collection('content').doc(holidayDoc).collection('nights').doc(String(n.night));
    batch.set(ref, {
      title: n.title,
      suggestion: n.suggestion,
      songTitle: n.songTitle || null,
      songLyrics: null,
      storySnippet: n.storySnippet || null,
      linkedItemId: null,
      holiday: 'hanukkah',
      ageRange: ['0-2', '3-5', '6-8', '9-12'],
      depthLevel: 'introductory',
      beamCategories: ['culture'],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  batch.set(db.doc('config/hanukkah-2026'), {
    holiday: 'hanukkah',
    displayName: 'Hanukkah 2026',
    startsOn: HANUKKAH_START,
    lockAt: LOCK_AT,
    expeditedLockAt: EXPEDITED_LOCK_AT,
    estimatedDeliveryBy: ESTIMATED_DELIVERY_BY,
    passoverWaitlistOpens: '2027-02-01',
  });

  batch.set(db.doc('config/passover-2027-waitlist'), {
    displayName: 'Passover 2027',
    holdPenaltyPercent: 50,
    cancelFreeUntil: '2027-01-15T05:00:00.000Z',
    capacityPercent: 39,
    active: true,
  });

  await batch.commit();
  console.log('Seeded content/nights/1-8 and config/hanukkah-2026, config/passover-2027-waitlist');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
