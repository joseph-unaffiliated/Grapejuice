/**
 * Daily list of Grapejuice account and purchaser emails, written for the Unaffiliated
 * newsletter workspace (198880) to exclude. Upload runs when CUSTOMERIO_NEWSLETTER_APP_API_KEY
 * is set; until then the hashes sit on adminConfig/newsletterSuppression for the manual segment.
 */
import { createHash } from 'crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from './logger';
import { onSchedule } from './sentry';
import { emailHash } from './guestSessions';
import { isTest } from './testAccounts';

const SEGMENT_NAME = 'Grapejuice customers and drafts (suppress)';

async function emails(db: Firestore): Promise<string[]> {
  const [users, orders] = await Promise.all([
    db.collection('users').select('email').get(),
    db.collectionGroup('orders').select('status', 'holidayId', 'email').get(),
  ]);
  const out = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string' || !raw.includes('@')) return;
    const email = raw.trim().toLowerCase();
    if (!isTest(email)) out.add(email);
  };
  for (const u of users.docs) add(u.data().email);
  for (const o of orders.docs) {
    if (o.data().holidayId === 'hanukkah-2026' && o.data().status === 'committed') add(o.data().email);
  }
  return [...out];
}

export async function syncNewsletterSuppression(db: Firestore, apiKey: string | null): Promise<{ emails: number; uploaded: boolean }> {
  const list = await emails(db);
  const hashes = list.map((e) => emailHash(e));
  await db.doc('adminConfig/newsletterSuppression').set({
    count: list.length,
    hashes,
    updatedAt: new Date().toISOString(),
  });
  if (!apiKey) return { emails: list.length, uploaded: false };
  const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const existing = await fetch('https://api.customer.io/v1/segments?limit=100', { headers: auth });
  if (!existing.ok) throw new Error(`Customer.io segments ${existing.status}`);
  const body = (await existing.json()) as { segments?: Array<{ id?: number; name?: string; type?: string }> };
  let id = body.segments?.find((s) => s.name === SEGMENT_NAME)?.id;
  if (!id) {
    const made = await fetch('https://api.customer.io/v1/segments', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ segment: { name: SEGMENT_NAME, description: 'Do not pitch Grapejuice to these people.' } }),
    });
    if (!made.ok) throw new Error(`Customer.io create segment ${made.status}`);
    const created = (await made.json()) as { segment?: { id?: number } };
    id = created.segment?.id;
  }
  if (!id) throw new Error('Newsletter suppression segment has no id');
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000);
    const res = await fetch(`https://track.customer.io/api/v1/segments/${id}/add_customers`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: chunk.map((e) => createHash('sha256').update(e).digest('hex')) }),
    });
    if (!res.ok) {
      logger.warn('newsletterSuppression: add_customers not accepted, hashes are stored', { status: res.status });
      return { emails: list.length, uploaded: false };
    }
  }
  return { emails: list.length, uploaded: true };
}

export const scheduledNewsletterSuppression = onSchedule(
  { schedule: '15 6 * * *', timeZone: 'America/New_York', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    try {
      const key = process.env.CUSTOMERIO_NEWSLETTER_APP_API_KEY?.trim() || null;
      const result = await syncNewsletterSuppression(db, key);
      await db.doc('programJobs/newsletterSuppression').set({ at: new Date().toISOString(), ok: true, ...result });
      logger.info('newsletterSuppression', result);
    } catch (err) {
      logger.error('newsletterSuppression failed', err instanceof Error ? err : new Error(String(err)));
      await db.doc('programJobs/newsletterSuppression').set({ at: new Date().toISOString(), ok: false, error: String(err).slice(0, 400) });
    }
  }
);
