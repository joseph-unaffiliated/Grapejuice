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
assert.equal(kosherNoticeVersion({ householdNote: 'we keep kosher', edibleNames: [] }), null);

const withFood = renderKosherNotice({
  foods,
  boxUrl: 'https://grapejuice.co/box',
});
assert.equal(withFood.subject, 'A note about the food items in your box');
assert.match(withFood.html, /Review the food items in your box/);
assert.match(withFood.html, /Food items in your box/);
assert.equal(withFood.html.includes('Please review the food items'), false);
assert.match(withFood.html, /none of the food items in this box are certified kosher/);
assert.match(withFood.html, /have flour and call for egg/);
assert.match(withFood.html, /dairy-free \(pareve\)/);
assert.match(withFood.html, /egg-substitute \(not provided\)/);
assert.match(withFood.html, /between now and Nov\. 7/);
assert.match(withFood.html, /Review my box/);
assert.match(withFood.html, /Latke kit/);
assert.match(withFood.html, /Sufganiyot kit/);
assert.match(withFood.html, /Chocolate gelt/);
assert.equal(withFood.html.includes('Cookie cutters'), false);
assert.equal(/score|we think you are kosher|OU-certified/i.test(withFood.html), false);
assert.match(withFood.html, new RegExp(LATKE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(withFood.html, /grapejuice-wordmark-on-white/);
assert.match(withFood.html, /grapejuice-wordmark-gold/);

const docs = join(__dirname, '../../docs');
writeFileSync(join(docs, 'customerio-kosher-notice.html'), withFood.html);

console.log('kosherNotice tests passed');
