/**
 * Sign the mockup guest (a draft box for Sam) into a joseph+test account through the
 * real phone code sign-in, and save the signed-in session as a fixture for the
 * mockup-fidelity harness. The emailed code is swapped for a known one in
 * loginCodes/{emailHash} using the local `firebase login` session, so no inbox is needed.
 * Test-account orders never allocate stock.
 *
 *   GJ_BASE_URL=http://localhost:8081 node scripts/flows/member-box.mjs [purpose=mockup] [fixture=mockup-member]
 */
import { createHash } from 'node:crypto';
import { launch, settle, saveStorage, storagePath, TEST_EMAIL, BASE_URL, PHONE } from './lib.mjs';
import { firestoreFromFirebaseCliLogin } from '../lib/firebaseCliCredential.mjs';

const purpose = process.argv[2] || 'mockup';
const fixture = process.argv[3] || 'mockup-member';
const email = TEST_EMAIL(purpose);
const KNOWN_CODE = '246810';
const sha = (s) => createHash('sha256').update(s).digest('hex');

function guestState() {
  const file = storagePath('mockup-guest');
  return file ?? null;
}

async function main() {
  const db = firestoreFromFirebaseCliLogin('grapejuice-pilot');
  if (!db) throw new Error('Run `npx firebase-tools login` first.');
  const { browser, context, page } = await launch({ device: PHONE, storageState: guestState() });
  page.on('console', (m) => {
    if (/\[auth\]|merge|guest/i.test(m.text())) console.log('console', m.type(), m.text().slice(0, 240));
  });
  await page.goto(`${BASE_URL}/login?mbx=new`, { waitUntil: 'load' });
  await settle(page, 4000);

  await page.getByLabel('Email').first().fill(email);
  const requestedAt = Date.now();
  await page.getByRole('button', { name: 'Email me a code' }).first().click();

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

  await page.getByRole('button', { name: 'Enter the 6-digit code' }).first().click().catch(() => {});
  await page.getByLabel('Code', { exact: true }).first().fill(KNOWN_CODE, { force: true });
  await settle(page, 6000);
  if (process.env.GJ_FLOW_SHOTS) await page.screenshot({ path: `${process.env.GJ_FLOW_SHOTS}/member-after-code.png` });
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
  const guestLeft = await page.evaluate(() => !!localStorage.getItem('grapejuice-guest-session'));
  console.log(guestLeft ? 'guest session still in localStorage after sign-in' : 'guest session cleared');
  console.log(`storage state: ${await saveStorage(context, fixture)}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
