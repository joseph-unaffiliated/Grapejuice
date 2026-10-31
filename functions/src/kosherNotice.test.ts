/**
 * Run: npx tsx src/kosherNotice.test.ts
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { edibleFoodLines, kosherNoticeVersion, mentionsKeepingKosher, renderKosherNotice } from './kosherNotice';

const LATKE = 'https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/catalog/hanukkah/items/latke-kit/primary-0-fad2029b3c90.webp';
const foods = [
  { name: 'Latke kit', imageUrl: LATKE },
  { name: 'Sufganiyot kit', imageUrl: LATKE },
  { name: 'Chocolate gelt', imageUrl: LATKE },
];
const lines = [
  { slotId: 'latke-mix', itemId: 'latke-kit', label: 'Latke kit', imageUrl: LATKE },
  { slotId: 'sufganiyot-mix', itemId: 'sufganiyot-kit', label: 'Sufganiyot kit', imageUrl: LATKE },
  { slotId: 'gelt-medium', itemId: 'gelt-medium', label: 'Chocolate gelt', imageUrl: LATKE },
  { slotId: 'story-k1', itemId: 'book-a', label: 'The Latke Who Couldn’t Stop Screaming' },
];

assert.equal(mentionsKeepingKosher('we keep kosher'), true);
assert.equal(mentionsKeepingKosher('asked the Rav: we are kosher'), true);
assert.equal(mentionsKeepingKosher('we are not kosher'), false);
assert.equal(mentionsKeepingKosher('kosher-style dinner'), false);
assert.deepEqual(edibleFoodLines(lines).map((f) => f.name), ['Latke kit', 'Sufganiyot kit', 'Chocolate gelt']);

assert.equal(
  kosherNoticeVersion({ householdNote: 'we keep kosher', edibleNames: ['Latke kit'] }),
  'with_food'
);
assert.equal(
  kosherNoticeVersion({ ravText: 'please tell the Rav we keep kosher', edibleNames: ['Chocolate gelt'] }),
  'with_food'
);
assert.equal(kosherNoticeVersion({ householdNote: 'not kosher', edibleNames: ['Latke kit'] }), null);
assert.equal(kosherNoticeVersion({ householdNote: 'kosher-style', edibleNames: ['Latke kit'] }), null);
assert.equal(
  kosherNoticeVersion({ practiceScore: 80, practiceTouched: true, edibleNames: ['Latke kit'] }),
  'with_food'
);
assert.equal(
  kosherNoticeVersion({ practiceScore: 80, practiceTouched: true, edibleNames: [] }),
  null
);
assert.equal(
  kosherNoticeVersion({ practiceScore: 30, practiceTouched: true, edibleNames: ['Latke kit'] }),
  null
);
assert.equal(
  kosherNoticeVersion({ practiceScore: 50, practiceTouched: false, edibleNames: ['Latke kit'] }),
  null
);
assert.equal(
  kosherNoticeVersion({ householdNote: 'we keep kosher', edibleNames: [] }),
  'already_out'
);

const withFood = renderKosherNotice({
  version: 'with_food',
  foods,
  boxUrl: 'https://grapejuice.co/box',
  swaps: [
    { name: 'Cookie cutters', imageUrl: LATKE, note: 'This leaves the non-OU food behind. The box price does not change.' },
    { name: 'A big bag of gelt', imageUrl: LATKE, note: 'Vegan, and not OU-certified. This does not leave the non-OU food behind.' },
  ],
});
assert.match(withFood.html, /vegan, and it is not OU-certified kosher/i);
assert.match(withFood.html, /Latke kit/);
assert.match(withFood.html, /Sufganiyot kit/);
assert.match(withFood.html, /Chocolate gelt/);
assert.match(withFood.html, /Cookie cutters/);
assert.match(withFood.html, /not OU-certified/);
assert.match(withFood.html, new RegExp(LATKE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(/score|we think you are kosher/i.test(withFood.html), false);
assert.match(withFood.html, /grapejuice-wordmark-on-white/);

const cleared = renderKosherNotice({ version: 'already_out', foods: [], boxUrl: 'https://grapejuice.co/box' });
assert.match(cleared.html, /already out of the box/i);
assert.equal(cleared.html.includes('Cookie cutters'), false);
assert.match(cleared.html, /grapejuice-wordmark-gold/);

const docs = join(__dirname, '../../docs');
writeFileSync(join(docs, 'customerio-kosher-notice.html'), withFood.html);
writeFileSync(join(docs, 'customerio-kosher-notice-cleared.html'), cleared.html);

console.log('kosherNotice tests passed');
