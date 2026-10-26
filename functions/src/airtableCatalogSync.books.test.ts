import assert from 'node:assert/strict';
import { bookToItem } from './airtableCatalogSync';

const noImages = { imageUrl: null, imageUrls: [], imageThumbUrls: [] };
const sel = (name: string) => ({ id: `sel${name}`, name });

const fcRow = (fields: Record<string, unknown>) => ({
  id: 'recFC',
  fields: {
    fldSPjarW6aFocHj3: 'The Hanukkah Hop!',
    fldN3303eOahUbJFU: sel('Yes'),
    fldSKmIeWfuRoB2IC: 13,
    fld9ipf5vOEkaMGes: 13,
    fldJNKCjYA1aLC2KU: 16.99,
    fldXpTJPasuaXfoeW: 1,
    fld19V2PBeilijWg5: [sel('3')],
    fldhdftdVkGmSQvCP: [sel('3')],
    ...fields,
  },
});
const hbRow = {
  id: 'recHB',
  fields: { fldCZVbxyEy7pFpl5: 'The Hanukkah Hop!', fldJTYzX1VZANE32g: 'Erica Silverman' },
};

const hop = bookToItem(fcRow({}), hbRow, noImages);
assert.ok(hop);
assert.equal(hop.id, 'book-the-hanukkah-hop');
assert.equal(hop.memberPriceCents, 1300);
assert.equal(hop.nonMemberPriceCents, 1300);
assert.equal(hop.unitCostCents, 1699);
assert.deepEqual(hop.ageGroups, ['3-5']);
assert.deepEqual(hop.defaultBookAges, [3]);
assert.deepEqual(hop.defaultFor, ['3-5']);
assert.equal(hop.inventory, null, 'book stock stays untracked');
assert.equal(hop.brand, 'Erica Silverman');
assert.equal(hop.airtableRecordId, 'recFC');

assert.equal(bookToItem(fcRow({ fldN3303eOahUbJFU: sel('No') }), hbRow, noImages), null);

const swapOnly = bookToItem(
  fcRow({ fldhdftdVkGmSQvCP: undefined, fld19V2PBeilijWg5: undefined, fld9ipf5vOEkaMGes: undefined }),
  hbRow,
  noImages
);
assert.ok(swapOnly);
assert.deepEqual(swapOnly.defaultBookAges, []);
assert.deepEqual(swapOnly.defaultFor, []);
assert.deepEqual(swapOnly.ageGroups, ['0-2', '3-5', '6-8', '9-12']);
assert.equal(swapOnly.nonMemberPriceCents, 1300, 'non-member falls back to member');

const unlinked = bookToItem(fcRow({ fldSPjarW6aFocHj3: 'Hanukkah Bear' }), null, noImages);
assert.equal(unlinked?.id, 'book-hanukkah-bear');

const kept = bookToItem(
  fcRow({ fldFpeHc3sxneJ1TH: true, fldujfIMeuuN7RfYN: 2, fldox7zzryePIFRn2: '2 — Joseph' }),
  hbRow,
  noImages
);
assert.equal(kept?.inventory, 1);
assert.equal(kept?.setAside, 2);
assert.equal(kept?.setAsideFor, '2 — Joseph');

console.log('airtableCatalogSync books ok');
