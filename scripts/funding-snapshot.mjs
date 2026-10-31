/**
 * Read-only snapshot for the Oct 30 funding meeting.
 * Same population as the slider canvas: Firestore users on grapejuice-pilot,
 * test emails removed, signed-out visitors left out.
 *
 *   node scripts/funding-snapshot.mjs
 *
 * Prints aggregate counts only. No names, emails, or notes.
 */
import { firestoreFromFirebaseCliLogin } from './lib/firebaseCliCredential.mjs';

const HOLIDAY_ID = 'hanukkah-2026';
const COMMITTED = new Set(['committed', 'confirmed', 'shipped', 'delivered']);

function isTestEmail(email) {
  if (!email || !String(email).includes('@')) return false;
  const s = String(email).toLowerCase();
  return /@unaffiliated?(\.co)?$/.test(s) || /@(a\.com|test\.com|example\.com)$/.test(s) || /joseph|jweissgold|brendan/.test(s);
}

function score(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : null;
}

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function iso(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return null;
}

function day(v) {
  const s = iso(v);
  return s ? s.slice(0, 10) : null;
}

function adNameOf(touch) {
  if (!touch || typeof touch !== 'object') return null;
  const u = touch.utm && typeof touch.utm === 'object' ? touch.utm : {};
  const content = str(u.utm_content) ?? str(u.content);
  if (content) return content;
  const source = (str(u.utm_source) ?? str(u.source) ?? '').toLowerCase();
  return source === 'meta' || str(touch.fbclid) ? 'Meta, ad unknown' : null;
}

function nonAdSourceOf(...touches) {
  const ts = touches.filter((t) => t && typeof t === 'object');
  for (const t of ts) {
    const u = t.utm && typeof t.utm === 'object' ? t.utm : {};
    const source = str(u.utm_source) ?? str(u.source);
    if (source) return `From ${source}`;
  }
  return null;
}

function sourceFamily(label) {
  const s = (label || '').toLowerCase();
  if (s.startsWith('convenient')) return 'Convenient ads';
  if (s.startsWith('beautiful')) return 'Beautiful ads';
  if (s.startsWith('affordable')) return 'Affordable ads';
  if (s.startsWith('customizable')) return 'Customizable ads';
  if (s.includes('grandparent')) return 'Grandparent-gift ads';
  if (s === 'meta, ad unknown') return 'Meta, ad unknown';
  if (s === 'direct / no tags') return 'Direct (no tags)';
  if (s === 'not recorded') return 'Not recorded';
  if (s.includes('newsletter') || s.includes('email') || s.startsWith('from ')) return 'Our emails / newsletter';
  if (s.startsWith('referral:')) return 'Referral';
  return 'Other ads';
}

function mean(xs) {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    const a = x - mx;
    const b = y - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (!dx || !dy) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

function practiceBand(n) {
  if (n == null) return null;
  if (n <= 33) return 'Rarely (0–33)';
  if (n === 50) return 'Exactly 50';
  if (n <= 66) return 'Sometimes (34–66, ex 50)';
  return 'Often (67–100)';
}

function hanukkahBand(n) {
  if (n == null) return null;
  if (n <= 39) return 'Barely (0–39)';
  if (n === 50) return 'Exactly 50';
  if (n <= 79) return 'Some (40–79, ex 50)';
  return 'All in (80–100)';
}

const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
if (!db) {
  console.error('No Firebase CLI login. Run `npx firebase-tools login` and retry.');
  process.exit(1);
}

const [userSnap, orderSnap, draftSnap, guestSnap, inviteSnap, enrollSnap] = await Promise.all([
  db.collection('users').get(),
  db.collectionGroup('orders').select('orderType', 'holidayId', 'status', 'playthrough', 'userId', 'createdAt').get(),
  db.collectionGroup('boxDrafts').select('lineItems').get(),
  db.collection('guestSessions').select('convertedUid', 'snapshot.guest', 'entry').get(),
  db.collection('pilotInvites').select('email', 'status', 'source').get(),
  db.collection('pilotEnrollments').select('status').get(),
]);

const guestAnswers = new Map();
const guestAd = new Map();
for (const d of guestSnap.docs) {
  const x = d.data();
  const uid = str(x.convertedUid);
  const guest = x.snapshot?.guest;
  if (!uid || !guest) continue;
  const hanukkah = score(guest.familiarityScore);
  const jewish = score(guest.practiceFrequencyScore);
  if (hanukkah != null || jewish != null) guestAnswers.set(uid, { hanukkah, jewish });
  const ad = adNameOf(x.entry);
  if (ad) guestAd.set(uid, ad);
}

const purchasedHouseholds = new Set();
const pendingHouseholds = new Set();
const orderStatus = {};
let giftPaid = 0;
let storefront = 0;
for (const d of orderSnap.docs) {
  const o = d.data();
  const hid = d.ref.parent.parent?.id;
  const status = str(o.status) ?? 'unknown';
  orderStatus[`${o.orderType ?? 'unset'}:${status}`] = (orderStatus[`${o.orderType ?? 'unset'}:${status}`] ?? 0) + 1;
  if (o.playthrough === true) continue;
  if (o.orderType === 'marketplace') {
    if (COMMITTED.has(status) || status === 'paid') storefront += 1;
    continue;
  }
  if (o.orderType === 'received_gift') {
    if (COMMITTED.has(status) || status === 'paid') giftPaid += 1;
    continue;
  }
  const isBox = o.orderType === 'hanukkah_box' || (!o.orderType && o.holidayId === HOLIDAY_ID);
  if (!isBox || !hid) continue;
  if (COMMITTED.has(status)) purchasedHouseholds.add(hid);
  else if (status === 'pending') pendingHouseholds.add(hid);
}

const draftHouseholds = new Set();
for (const d of draftSnap.docs) {
  const hh = d.ref.parent.parent;
  if (d.id !== HOLIDAY_ID || !hh || hh.parent.id !== 'households') continue;
  const lines = d.data().lineItems;
  if (Array.isArray(lines) && lines.length > 0) draftHouseholds.add(hh.id);
}

let testExcluded = 0;
const people = [];
for (const s of userSnap.docs) {
  const x = s.data() ?? {};
  const email = str(x.email);
  if (isTestEmail(email) || isTestEmail(str(x.displayName))) {
    testExcluded += 1;
    continue;
  }
  const last = x.lastBoxAnswers ?? {};
  const guest = guestAnswers.get(s.id) ?? {};
  const hanukkah = score(last.familiarityScore) ?? guest.hanukkah ?? null;
  const jewish = score(last.practiceFrequencyScore) ?? guest.jewish ?? null;
  const attr = x.attribution ?? {};
  const rawSource =
    adNameOf(attr.firstTouch) ??
    adNameOf(attr.lastTouch) ??
    guestAd.get(s.id) ??
    (str(attr.fbc) ? 'Meta, ad unknown' : null) ??
    nonAdSourceOf(attr.firstTouch, attr.lastTouch) ??
    (str(attr.unaffiliatedUserID) ? 'Unaffiliated newsletter' : null) ??
    (attr.firstTouch || attr.lastTouch ? 'Direct / no tags' : 'Not recorded');
  const drafts = Array.isArray(last.childDrafts) ? last.childDrafts : [];
  const kids = drafts.filter((c) => c && c.role !== 'adult');
  const adults = drafts.filter((c) => c && c.role === 'adult');
  const kidAges = kids
    .map((c) => (typeof c.plannerAge === 'number' && Number.isFinite(c.plannerAge) ? c.plannerAge : null))
    .filter((n) => n != null);
  const note = str(last.ravNotes) ?? str(x.ravNotes);
  const interests = Array.isArray(x.storefrontInterests) ? x.storefrontInterests : [];
  const hid = str(x.householdId);
  people.push({
    created: day(x.createdAt),
    hanukkah,
    jewish,
    hanukkahLevel: hanukkah == null ? str(last.familiarityLevel) ?? str(x.familiarityLevel) : null,
    source: sourceFamily(rawSource),
    rawSource,
    bought: Boolean(hid && purchasedHouseholds.has(hid)),
    pending: Boolean(hid && pendingHouseholds.has(hid) && !purchasedHouseholds.has(hid)),
    built: Boolean(hid && (draftHouseholds.has(hid) || purchasedHouseholds.has(hid) || pendingHouseholds.has(hid))),
    kids: kids.length,
    kidAges,
    adults: adults.length,
    note: Boolean(note),
    sms: x.smsOptIn === true,
    passover: interests.includes('passover-2027-notify'),
    beam: interests.includes('bmitzvah-pilot-interest'),
  });
}

const throughArg = process.argv.find((a) => a.startsWith('--through='));
const throughDay = throughArg ? throughArg.split('=')[1] : null;
const population = throughDay ? people.filter((p) => p.created && p.created <= throughDay) : people;

const both = population.filter((p) => p.hanukkah != null && p.jewish != null);
const buyers = population.filter((p) => p.bought);
const builtNotBought = population.filter((p) => p.built && !p.bought);
const nonBuyers = population.filter((p) => !p.bought);

function bandTable(rows) {
  const bands = ['Rarely (0–33)', 'Sometimes (34–66, ex 50)', 'Exactly 50', 'Often (67–100)'];
  return bands.map((band) => {
    const g = rows.filter((p) => practiceBand(p.jewish) === band);
    const kids = g.flatMap((p) => p.kidAges);
    const exDirect = g.filter((p) => p.source !== 'Direct (no tags)');
    return {
      band,
      accounts: g.length,
      avgHanukkah: mean(g.map((p) => p.hanukkah).filter((n) => n != null)),
      avgKids: mean(g.map((p) => p.kids)),
      noKids: g.filter((p) => p.kids === 0).length,
      threePlus: g.filter((p) => p.kids >= 3).length,
      avgKidAge: mean(kids),
      kids0to2: kids.filter((a) => a <= 2).length,
      kids13to17: kids.filter((a) => a >= 13 && a <= 17).length,
      kidAgeKnown: kids.length,
      bought: g.filter((p) => p.bought).length,
      boughtExDirect: `${exDirect.filter((p) => p.bought).length} of ${exDirect.length}`,
      notes: g.filter((p) => p.note).length,
      sms: g.filter((p) => p.sms).length,
    };
  });
}

function sourceTable(rows) {
  const counts = new Map();
  for (const p of rows) {
    const key = p.source;
    const cur = counts.get(key) ?? { source: key, accounts: 0, hanukkah: [], jewish: [], bought: 0 };
    cur.accounts += 1;
    if (p.hanukkah != null) cur.hanukkah.push(p.hanukkah);
    if (p.jewish != null) cur.jewish.push(p.jewish);
    if (p.bought) cur.bought += 1;
    counts.set(key, cur);
  }
  return [...counts.values()]
    .map((r) => ({
      source: r.source,
      accounts: r.accounts,
      avgHanukkah: mean(r.hanukkah),
      avgJewish: mean(r.jewish),
      bought: r.bought,
      purchaseRate: r.accounts ? Math.round((r.bought / r.accounts) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.accounts - a.accounts);
}

const createdDays = people.map((p) => p.created).filter(Boolean).sort();
const throughOct15 = people.filter((p) => p.created && p.created >= '2026-10-02' && p.created <= '2026-10-15');
const afterOct15 = people.filter((p) => p.created && p.created > '2026-10-15');
const noteWriters = population.filter((p) => p.note);
const blankNote = population.filter((p) => !p.note);
const highBoth = both.filter((p) => p.hanukkah >= 67 && p.jewish >= 67);
const highHanukkahLowPractice = both.filter((p) => p.hanukkah >= 80 && p.jewish <= 33);
const lowHanukkahHighPractice = both.filter((p) => p.hanukkah <= 39 && p.jewish >= 67);
const hanukkah80 = population.filter((p) => p.hanukkah != null && p.hanukkah >= 80);
const hanukkah100 = population.filter((p) => p.hanukkah === 100);
const allInRarely = both.filter((p) => p.hanukkah >= 80 && p.jewish <= 33);

const rawTop = new Map();
for (const p of population) rawTop.set(p.rawSource, (rawTop.get(p.rawSource) ?? 0) + 1);

const out = {
  asOf: new Date().toISOString(),
  project: 'grapejuice-pilot',
  usersInFirestore: userSnap.size,
  testExcluded,
  window: throughDay ? `created on or before ${throughDay}` : 'all real accounts',
  realAccounts: population.length,
  createdMin: createdDays[0] ?? null,
  createdMax: createdDays[createdDays.length - 1] ?? null,
  realCreatedOct2to15: throughOct15.length,
  realCreatedAfterOct15: afterOct15.length,
  boughtAfterOct15: afterOct15.filter((p) => p.bought).length,
  bothSliders: both.length,
  correlation: pearson(both.map((p) => [p.hanukkah, p.jewish])),
  correlationExExact50: pearson(both.filter((p) => p.hanukkah !== 50 && p.jewish !== 50).map((p) => [p.hanukkah, p.jewish])),
  hanukkahAt100: hanukkah100.length,
  hanukkah80plus: hanukkah80.length,
  hanukkahNumeric: population.filter((p) => p.hanukkah != null).length,
  allInHanukkahRarelyPractice: allInRarely.length,
  bought: buyers.length,
  pendingNotBought: population.filter((p) => p.pending).length,
  builtBox: population.filter((p) => p.built).length,
  buyerAvgHanukkah: mean(buyers.map((p) => p.hanukkah).filter((n) => n != null)),
  nonBuyerAvgHanukkah: mean(nonBuyers.map((p) => p.hanukkah).filter((n) => n != null)),
  buyerAvgPractice: mean(buyers.map((p) => p.jewish).filter((n) => n != null)),
  builtNotBoughtAvgPractice: mean(builtNotBought.map((p) => p.jewish).filter((n) => n != null)),
  builtNotBoughtAvgHanukkah: mean(builtNotBought.map((p) => p.hanukkah).filter((n) => n != null)),
  highBothBought: `${highBoth.filter((p) => p.bought).length} of ${highBoth.length}`,
  highHanukkahLowPracticeBought: `${highHanukkahLowPractice.filter((p) => p.bought).length} of ${highHanukkahLowPractice.length}`,
  lowHanukkahHighPracticeBought: `${lowHanukkahHighPractice.filter((p) => p.bought).length} of ${lowHanukkahHighPractice.length}`,
  notes: noteWriters.length,
  notesBought: noteWriters.filter((p) => p.bought).length,
  blankBought: `${blankNote.filter((p) => p.bought).length} of ${blankNote.length}`,
  passoverInterest: population.filter((p) => p.passover).length,
  beamInterest: population.filter((p) => p.beam).length,
  pilotInvites: inviteSnap.size,
  pilotEnrollments: enrollSnap.size,
  giftOrdersCommittedOrPaid: giftPaid,
  storefrontOrdersCommittedOrPaid: storefront,
  orderStatus,
  practiceBands: bandTable(both),
  sources: sourceTable(population),
  focusAds: ['first-hanukkah', 'both-holidays', 'food-fits', 'no-fluency', 'interfaith', 'convenient', 'affordable', 'beautiful', 'grandparent', 'customizable'].map(
    (needle) => {
      const g = population.filter((p) => p.rawSource.toLowerCase().includes(needle));
      return {
        needle,
        accounts: g.length,
        avgHanukkah: mean(g.map((p) => p.hanukkah).filter((n) => n != null)),
        avgJewish: mean(g.map((p) => p.jewish).filter((n) => n != null)),
        bought: g.filter((p) => p.bought).length,
      };
    },
  ),
  rawSourceTop: [...rawTop.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([source, accounts]) => ({ source, accounts })),
};

console.log(JSON.stringify(out, null, 2));
process.exit(0);
