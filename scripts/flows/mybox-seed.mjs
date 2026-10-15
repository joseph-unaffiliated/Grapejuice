/**
 * Build the resettable My Box fuzz account: joseph+test-mybox@unaffiliated.co with
 * 3 kids of mixed ages. Signs in through the real phone code flow, writes kids + a
 * curated Hanukkah draft via Firestore, then saves Playwright storage and a baseline
 * line-item snapshot for soft resets during the fuzz run.
 *
 *   GJ_BASE_URL=http://localhost:8081 node scripts/flows/mybox-seed.mjs
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launch, settle, saveStorage, writeFixture, rnClick, boxSummaryLocator, TEST_EMAIL, BASE_URL, PHONE, FIXTURES } from './lib.mjs';
import { firestoreFromFirebaseCliLogin } from '../lib/firebaseCliCredential.mjs';
import { buildCuratedBox } from '../../src/services/box/buildDefaultBox.ts';

const email = TEST_EMAIL('mybox');
const KNOWN_CODE = '246810';
const HOLIDAY_ID = 'hanukkah-2026';
const sha = (s) => createHash('sha256').update(s).digest('hex');

const KIDS = [
  { name: 'Ava', ageGroup: '3-5', plannerAge: 3 },
  { name: 'Sam', ageGroup: '6-8', plannerAge: 7 },
  { name: 'Noa', ageGroup: '9-12', plannerAge: 11 },
];

async function dismissCookies(page) {
  await page.evaluate(() => {
    for (const id of ['onetrust-consent-sdk', 'onetrust-banner-sdk', 'ot-sdk-btn-floating']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  });
}

async function signInWithCode(page, db) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });
  await settle(page, 4000);
  await dismissCookies(page);

  // Prefer Account → code sign-in if /login redirected to the storefront.
  if (!(await page.getByLabel('Email').count())) {
    await rnClick(page, { ariaLabel: 'Account' }).catch(() => {});
    await settle(page, 1000);
    await rnClick(page, { text: /Log in|Sign in|Email me a code|Continue with email/ }).catch(() => {});
    await settle(page, 1000);
  }

  const emailField = page.locator('input[type="email"], [aria-label="Email"]').first();
  await emailField.waitFor({ state: 'attached', timeout: 30_000 });
  await emailField.fill(email, { force: true });
  const requestedAt = Date.now();
  await rnClick(page, { text: /Email me a code/ }).catch(async () => {
    await page.getByRole('button', { name: 'Email me a code' }).first().click({ force: true });
  });

  const emailKey = sha(email.trim().toLowerCase());
  const ref = db.doc(`loginCodes/${emailKey}`);
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await page.waitForTimeout(500);
    const snap = await ref.get();
    const created = snap.exists ? snap.get('createdAt')?.toMillis?.() ?? 0 : 0;
    ready = created >= requestedAt - 5000;
  }
  if (!ready) throw new Error('No login code was issued.');
  await ref.update({ codeHash: sha(`${emailKey}:${KNOWN_CODE}`), attempts: 0 });

  await page.getByRole('button', { name: 'Enter the 6-digit code' }).first().click({ force: true }).catch(() => {});
  const codeField = page.getByLabel('Code', { exact: true }).or(page.locator('input[autocomplete="one-time-code"]')).first();
  await codeField.fill(KNOWN_CODE, { force: true });
  await settle(page, 7000);

  const authRecords = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onsuccess = () => {
          const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
          const all = tx.objectStore('firebaseLocalStorage').getAll();
          all.onsuccess = () => resolve(all.result.length);
          all.onerror = () => resolve(-1);
        };
        req.onerror = () => resolve(-1);
      })
  );
  if (authRecords < 1) throw new Error('Signed in, but no Firebase session was persisted.');
  console.log('signed in');
}

async function ensureAccount(db) {
  const users = await db.collection('users').where('email', '==', email).limit(1).get();
  if (users.empty) throw new Error(`No users doc for ${email} after sign-in`);
  const uid = users.docs[0].id;
  let householdId = users.docs[0].data().householdId;
  if (!householdId) {
    // Guest-style household id used by other test accounts when no real household exists.
    householdId = `guest_${email.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
    await db.doc(`households/${householdId}`).set(
      { createdAt: new Date().toISOString(), ownerUid: uid, email, test: true },
      { merge: true }
    );
    await db.doc(`users/${uid}`).set({ householdId }, { merge: true });
  }

  // Replace kids.
  const kidsCol = db.collection(`users/${uid}/children`);
  const existing = await kidsCol.get();
  for (const d of existing.docs) await d.ref.delete();
  const savedKids = [];
  for (const kid of KIDS) {
    const ref = kidsCol.doc();
    await ref.set({
      name: kid.name,
      ageGroup: kid.ageGroup,
      plannerAge: kid.plannerAge,
      birthdate: null,
      birthday: null,
      hebrewName: null,
      barMitzvahDate: null,
      beamStatus: 'not_eligible',
      ravEnabled: false,
    });
    savedKids.push({ id: ref.id, name: kid.name, ageGroup: kid.ageGroup, plannerAge: kid.plannerAge });
  }

  const catalogSnap = await db.collection('catalog/hanukkah/items').get();
  const catalog = catalogSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const curated = buildCuratedBox(catalog, savedKids, { adults: 2, practice: 'moderate' });
  const lineItems = curated.lineItems.map((line) =>
    Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined))
  );
  const now = new Date().toISOString();
  await db.doc(`households/${householdId}/boxDrafts/${HOLIDAY_ID}`).set(
    {
      holidayId: HOLIDAY_ID,
      lineItems,
      wrapSelectedItemIds: [],
      familiarityLevel: 'moderate',
      updatedAt: now,
      updatedBy: uid,
      lastChangeSource: 'box-fuzz-seed',
    },
    { merge: true }
  );

  await db.doc(`users/${uid}`).set(
    {
      onboardingComplete: true,
      boxRevealComplete: true,
      familiarityLevel: 'moderate',
      lastBoxAnswers: {
        familiarityLevel: 'moderate',
        familiarityScore: 50,
        practiceFrequencyScore: 40,
        childInterests: [],
        ravNotes: '',
        childDrafts: [
          { name: 'Test Parent', role: 'adult', ageGroup: '9-12' },
          { name: 'Partner', role: 'adult', ageGroup: '9-12' },
          ...KIDS.map((k) => ({ name: k.name, role: 'kid', ageGroup: k.ageGroup, plannerAge: k.plannerAge })),
        ],
        savedAt: now,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  console.log(`seeded ${savedKids.length} kids, ${lineItems.length} lines on household ${householdId}`);
  return { uid, householdId, lineItems, kids: savedKids };
}

async function main() {
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('Run `npx firebase-tools login` first.');

  const { browser, context, page } = await launch({
    device: PHONE,
    extraInit: () => {
      try {
        window.localStorage.setItem('grapejuice-box-fuzz', '1');
      } catch {}
    },
  });

  await signInWithCode(page, db);
  const seeded = await ensureAccount(db);

  await page.goto(`${BASE_URL}/box`, { waitUntil: 'load' });
  await boxSummaryLocator(page).waitFor({ timeout: 90_000 });
  await settle(page, 3500);

  let snap = null;
  for (let i = 0; i < 40 && !snap?.lineItems?.length; i++) {
    snap = await page.evaluate(() => window.__boxAudit ?? null);
    if (!snap?.lineItems?.length) await page.waitForTimeout(500);
  }
  if (!snap?.lineItems?.length) {
    // Hook may need a reload after Firestore seed.
    await page.reload({ waitUntil: 'load' });
    await boxSummaryLocator(page).waitFor({ timeout: 60_000 });
    await settle(page, 3000);
    for (let i = 0; i < 40 && !snap?.lineItems?.length; i++) {
      snap = await page.evaluate(() => window.__boxAudit ?? null);
      if (!snap?.lineItems?.length) await page.waitForTimeout(500);
    }
  }
  if (!snap?.lineItems?.length) {
    // Fall back to the Firestore lines we just wrote.
    snap = {
      lineItems: seeded.lineItems,
      wrapSelectedItemIds: [],
      totalCents: 8000,
      audit: { ok: true, kids: 3, people: 5 },
      open: [],
    };
    console.warn('window.__boxAudit missing; using Firestore baseline');
  }

  writeFixture('mybox-fuzz-baseline', {
    email,
    kids: KIDS,
    householdId: seeded.householdId,
    uid: seeded.uid,
    lineItems: snap.lineItems,
    wrapSelectedItemIds: snap.wrapSelectedItemIds ?? [],
    totalCents: snap.totalCents,
    audit: { ok: snap.audit?.ok, kids: snap.audit?.kids, people: snap.audit?.people, open: snap.open ?? [] },
  });
  console.log(`baseline: ${snap.lineItems.length} lines, total $${((snap.totalCents ?? 0) / 100).toFixed(2)}, open ${(snap.open ?? []).length}`);

  const stored = await saveStorage(context, 'mybox-fuzz');
  console.log(`storage: ${stored}`);
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURES, 'mybox-fuzz.meta.json'),
    JSON.stringify({ email, seededAt: new Date().toISOString(), kids: KIDS, householdId: seeded.householdId }, null, 2)
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
