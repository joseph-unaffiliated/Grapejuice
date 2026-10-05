import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import {
  fallbackSessionForLead,
  parseClickedAt,
  processRetentionLead,
  signForward,
  verifyForwardSignature,
  visitorIdFromLandingUrl,
} from './retentionLead';
import { scrubChildNames, summarizeSnapshot, validateSnapshot } from './guestSessions';

// --- signature -------------------------------------------------------------------------------

const secret = 'test-secret';
const body = JSON.stringify({ email: 'a@b.co' });
const ts = String(Date.now());
const sig = signForward(secret, ts, body);
assert.equal(verifyForwardSignature({ secret, timestamp: ts, signature: sig, rawBody: body }), true);
assert.equal(verifyForwardSignature({ secret, timestamp: ts, signature: sig.toUpperCase(), rawBody: body }), true);
assert.equal(verifyForwardSignature({ secret: 'other', timestamp: ts, signature: sig, rawBody: body }), false);
assert.equal(verifyForwardSignature({ secret, timestamp: ts, signature: sig, rawBody: body + ' ' }), false);
assert.equal(verifyForwardSignature({ secret, timestamp: undefined, signature: sig, rawBody: body }), false);
assert.equal(verifyForwardSignature({ secret, timestamp: ts, signature: 'zz', rawBody: body }), false);
const stale = String(Date.now() - 6 * 60 * 1000);
assert.equal(
  verifyForwardSignature({ secret, timestamp: stale, signature: signForward(secret, stale, body), rawBody: body }),
  false,
  'timestamps older than 5 minutes are rejected'
);

// --- gjv parsing -----------------------------------------------------------------------------

assert.equal(visitorIdFromLandingUrl('https://grapejuice.co/?gjv=abcdefghijklmnop1234'), 'abcdefghijklmnop1234');
assert.equal(visitorIdFromLandingUrl('https://grapejuice.co/store?utm_source=x&gjv=abcdefghijklmnop1234&vge=true'), 'abcdefghijklmnop1234');
assert.equal(visitorIdFromLandingUrl('https://grapejuice.co/?gjv=short'), null, 'too short');
assert.equal(visitorIdFromLandingUrl('https://grapejuice.co/?gjv=bad id with spaces'), null);
assert.equal(visitorIdFromLandingUrl('https://grapejuice.co/'), null);
assert.equal(visitorIdFromLandingUrl('not a url ?gjv=abcdefghijklmnop1234'), 'abcdefghijklmnop1234', 'regex fallback');
assert.equal(visitorIdFromLandingUrl(undefined), null);

// --- clicked_at ------------------------------------------------------------------------------

const clicked = parseClickedAt('Mon, 28 Nov 2022 19:47:42 UTC +00:00');
assert.ok(clicked, 'Retention UTC format parses');
assert.equal(clicked!.toISOString(), '2022-11-28T19:47:42.000Z');
assert.equal(parseClickedAt('2026-10-03T14:00:00Z')!.toISOString(), '2026-10-03T14:00:00.000Z');
assert.equal(parseClickedAt(''), null);
assert.equal(parseClickedAt(42), null);

// --- snapshot summary / validation ----------------------------------------------------------

const snapshot = {
  v: 1,
  guest: {
    childDrafts: [
      { name: 'Noa', role: 'kid', ageGroup: '6-8', plannerAge: 7 },
      { name: 'Dad', role: 'adult', ageGroup: '18+', plannerAge: 18 },
    ],
    lineItems: [{ slotId: 's1', itemId: 'i1', quantity: 1, unitCents: 0 }],
    boxRevealComplete: false,
    onboardingStep: 'reveal',
  },
  gift: null,
  entry: { utm: { campaign: 'c1' }, fbclid: null, referrer: 'https://www.facebook.com/', landingPath: '/' },
  path: '/box',
};
assert.deepEqual(summarizeSnapshot(snapshot), {
  hasBox: true,
  hasGiftDraft: false,
  boxItemCount: 1,
  kidCount: 1,
  onboardingStep: 'reveal',
});
assert.deepEqual(summarizeSnapshot({ v: 1, guest: {}, gift: null }), {
  hasBox: false,
  hasGiftDraft: false,
  boxItemCount: 0,
  kidCount: 0,
  onboardingStep: null,
});
assert.equal(
  summarizeSnapshot({ v: 1, guest: {}, gift: { status: 'incomplete', kind: 'customize', draft: { lineItems: [{}, {}] } } }).hasGiftDraft,
  true
);
assert.equal(validateSnapshot(snapshot), snapshot);
assert.throws(() => validateSnapshot({ ...snapshot, extra: 1 }), /unknown key/);
assert.throws(() => validateSnapshot({ ...snapshot, v: 2 }), /unsupported version/);
assert.throws(() => validateSnapshot({ ...snapshot, guest: 'nope' }), /guest must be an object/);
assert.throws(() => validateSnapshot({ ...snapshot, guest: { big: 'x'.repeat(60_000) } }), /too large/);
assert.throws(() => validateSnapshot([]), /must be an object/);

const scrubbed = scrubChildNames(snapshot);
assert.deepEqual(
  (scrubbed.guest as { childDrafts: Array<{ name: string }> }).childDrafts.map((c) => c.name),
  ['', '']
);
assert.equal((snapshot.guest.childDrafts[0] as { name: string }).name, 'Noa', 'original untouched');

// --- fallback matching + full processing against an in-memory Firestore stand-in -----------

type Doc = Record<string, unknown>;

function fakeDb(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const toMillis = (v: unknown): number =>
    v && typeof (v as { toMillis?: () => number }).toMillis === 'function'
      ? (v as { toMillis: () => number }).toMillis()
      : Number.NaN;
  const docRef = (path: string) => ({
    id: path.split('/').pop()!,
    path,
    get: async () => ({ exists: store.has(path), id: path.split('/').pop()!, data: () => store.get(path), ref: docRef(path) }),
    set: async (data: Doc, opts?: { merge?: boolean }) => {
      const prior = opts?.merge ? store.get(path) ?? {} : {};
      const next: Doc = { ...prior };
      for (const [k, v] of Object.entries(data)) {
        // FieldValue.increment stand-in: objects with operand
        const op = v as { operand?: number } | null;
        if (op && typeof op === 'object' && 'operand' in op && typeof op.operand === 'number') {
          next[k] = ((prior[k] as number) ?? 0) + op.operand;
        } else {
          next[k] = v;
        }
      }
      store.set(path, next);
    },
  });
  const db = {
    store,
    doc: docRef,
    collection: (name: string) => {
      const filters: Array<(d: Doc) => boolean> = [];
      const q = {
        where: (field: string, op: string, value: unknown) => {
          filters.push((d) => {
            const actual = d[field];
            if (op === '==') return actual === value;
            const a = toMillis(actual);
            const b = toMillis(value);
            if (op === '>=') return a >= b;
            if (op === '<=') return a <= b;
            return false;
          });
          return q;
        },
        limit: () => q,
        get: async () => {
          const docs = [...store.entries()]
            .filter(([p]) => p.startsWith(`${name}/`))
            .filter(([, d]) => filters.every((f) => f(d)))
            .map(([p, d]) => ({ id: p.split('/').pop()!, data: () => d, ref: docRef(p) }));
          return { docs, size: docs.length };
        },
      };
      return q;
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (ref: { path: string }) => ({ exists: store.has(ref.path) }),
        set: (ref: { path: string }, data: Doc) => store.set(ref.path, data),
      }),
  };
  return db as unknown as FirebaseFirestore.Firestore & { store: Map<string, Doc> };
}

(async () => {
  const { Timestamp } = await import('firebase-admin/firestore');
  const click = new Date('2026-10-03T14:00:00Z');
  const at = (offsetMin: number) => Timestamp.fromMillis(click.getTime() + offsetMin * 60_000);

  // Fallback: one matching session by referrer host inside the window.
  let db = fakeDb({
    'guestSessions/aaaaaaaaaaaaaaaaaaaa': { createdAt: at(-3), entry: { referrer: 'https://l.facebook.com/' }, hasBox: true },
    'guestSessions/bbbbbbbbbbbbbbbbbbbb': { createdAt: at(-3), entry: { referrer: 'https://www.google.com/' }, hasBox: true },
    'guestSessions/cccccccccccccccccccc': { createdAt: at(-30), entry: { referrer: 'https://l.facebook.com/' }, hasBox: true },
  });
  let match = await fallbackSessionForLead(db, { clickedAt: click, referrer: 'https://l.facebook.com/x', landingPageUrl: 'https://grapejuice.co/' });
  assert.equal(match?.id, 'aaaaaaaaaaaaaaaaaaaa');

  // Ambiguous (two facebook sessions in window) → no link.
  db = fakeDb({
    'guestSessions/aaaaaaaaaaaaaaaaaaaa': { createdAt: at(-3), entry: { referrer: 'https://l.facebook.com/' } },
    'guestSessions/bbbbbbbbbbbbbbbbbbbb': { createdAt: at(2), entry: { referrer: 'https://l.facebook.com/' } },
  });
  match = await fallbackSessionForLead(db, { clickedAt: click, referrer: 'https://l.facebook.com/', landingPageUrl: 'https://grapejuice.co/' });
  assert.equal(match, null);

  // Converted sessions are never candidates; no entry context on the lead → no link.
  db = fakeDb({
    'guestSessions/aaaaaaaaaaaaaaaaaaaa': { createdAt: at(0), entry: { referrer: 'https://l.facebook.com/' }, convertedUid: 'u1' },
  });
  match = await fallbackSessionForLead(db, { clickedAt: click, referrer: 'https://l.facebook.com/', landingPageUrl: 'https://grapejuice.co/' });
  assert.equal(match, null);
  match = await fallbackSessionForLead(db, { clickedAt: click, referrer: null, landingPageUrl: 'https://grapejuice.co/' });
  assert.equal(match, null);

  // Full processing (Customer.io not configured → identify/event skipped, still linked + token minted).
  const vid = 'abcdefghijklmnop1234';
  db = fakeDb({
    [`guestSessions/${vid}`]: { createdAt: at(-1), hasBox: true, kidCount: 2, boxItemCount: 5 },
  });
  const payload = {
    email: 'Parent@Example.com',
    clicked_at: 'Sat, 03 Oct 2026 14:00:00 UTC +00:00',
    landing_page_url: `https://grapejuice.co/?gjv=${vid}&utm_source=fb`,
    landing_page_domain: 'grapejuice.co',
  };
  const first = await processRetentionLead(db, payload, click);
  assert.equal(first.status, 'processed');
  assert.equal(first.linked, 'gjv');
  assert.equal(first.hasBox, true);
  assert.equal(first.eventSent, false, 'no Track API credentials in tests');
  const tokens = [...db.store.keys()].filter((k) => k.startsWith('guestResumeTokens/'));
  assert.equal(tokens.length, 1, 'one resume token minted');
  const tokenDoc = db.store.get(tokens[0])!;
  assert.equal(tokenDoc.visitorId, vid);
  assert.equal(tokenDoc.emailHash, createHash('sha256').update('parent@example.com').digest('hex'));
  assert.equal(db.store.get(`guestSessions/${vid}`)!.lastLeadEmailHash, tokenDoc.emailHash);

  const dup = await processRetentionLead(db, payload, click);
  assert.equal(dup.status, 'duplicate', 'same email + clicked_at is deduped');
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('guestResumeTokens/')).length, 1);

  const noBox = await processRetentionLead(db, { ...payload, clicked_at: 'Sat, 03 Oct 2026 15:00:00 UTC +00:00', landing_page_url: 'https://grapejuice.co/' }, click);
  assert.equal(noBox.status, 'processed');
  assert.equal(noBox.linked, null);
  assert.equal(noBox.hasBox, false);

  assert.deepEqual(await processRetentionLead(db, { email: 'nope' }, click), { status: 'ignored', reason: 'invalid_email' });

  console.log('retentionLead.test: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
