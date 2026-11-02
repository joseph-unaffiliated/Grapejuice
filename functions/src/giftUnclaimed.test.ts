/**
 * Run: npx tsx src/giftUnclaimed.test.ts
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_SHIP_TAX_CENTS, unclaimedGiftShipDecision } from './giftShip';
import {
  renderGiftRecipientEmail,
  renderGiftSenderEmail,
  shouldEmailGiftSender,
  unclaimedGiftNoteDue,
} from './giftUnclaimed';

const now = Date.parse('2026-11-06T15:00:00.000Z');
const dayAgo = new Date(now - 86_400_000).toISOString();
const hourAgo = new Date(now - 3_600_000).toISOString();
const twoDaysAgo = new Date(now - 2 * 86_400_000).toISOString();
const LATKE = 'https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/catalog/hanukkah/items/latke-kit/primary-0-fad2029b3c90.webp';

assert.equal(
  unclaimedGiftNoteDue({
    paid: true,
    status: 'pending',
    firstNotifiedAt: twoDaysAgo,
    recipientSentAt: null,
    senderSentAt: null,
    now,
  }),
  'recipient'
);
assert.equal(
  unclaimedGiftNoteDue({
    paid: true,
    status: 'pending',
    firstNotifiedAt: hourAgo,
    recipientSentAt: null,
    senderSentAt: null,
    now,
  }),
  null
);
assert.equal(
  unclaimedGiftNoteDue({
    paid: true,
    status: 'pending',
    firstNotifiedAt: null,
    recipientSentAt: null,
    senderSentAt: null,
    now,
  }),
  null
);
assert.equal(
  unclaimedGiftNoteDue({
    paid: true,
    status: 'pending',
    firstNotifiedAt: twoDaysAgo,
    recipientSentAt: hourAgo,
    senderSentAt: null,
    now,
  }),
  null
);
assert.equal(
  unclaimedGiftNoteDue({
    paid: true,
    status: 'pending',
    firstNotifiedAt: twoDaysAgo,
    recipientSentAt: dayAgo,
    senderSentAt: null,
    now,
  }),
  'sender'
);
assert.equal(
  unclaimedGiftNoteDue({
    paid: true,
    status: 'claimed',
    firstNotifiedAt: twoDaysAgo,
    recipientSentAt: dayAgo,
    senderSentAt: null,
    now,
  }),
  null
);
assert.equal(
  unclaimedGiftNoteDue({
    paid: false,
    status: 'pending',
    firstNotifiedAt: twoDaysAgo,
    recipientSentAt: null,
    senderSentAt: null,
    now,
  }),
  null
);

assert.deepEqual(unclaimedGiftShipDecision({ addressComplete: true, upgradeCents: 0 }), {
  ship: true,
  taxWaived: true,
  reason: 'ships',
});
assert.equal(AUTO_SHIP_TAX_CENTS, 0);
assert.equal(unclaimedGiftShipDecision({ addressComplete: true, upgradeCents: 0 }).taxWaived, true);
assert.equal(unclaimedGiftShipDecision({ addressComplete: false, upgradeCents: 0 }).reason, 'no_address');
assert.equal(unclaimedGiftShipDecision({ addressComplete: true, upgradeCents: 1200 }).ship, false);
assert.equal(unclaimedGiftShipDecision({ addressComplete: true, upgradeCents: 1200 }).reason, 'owes_addons');

const recipient = renderGiftRecipientEmail({
  giverName: 'Naomi',
  claimUrl: 'https://grapejuice.co/gift/claim?token=abc',
  items: [{ name: 'Latke kit', imageUrl: LATKE }],
});
assert.equal(recipient.subject, 'Where should we send your gift from Naomi?');
assert.match(recipient.html, /We just need one more thing/);
assert.match(recipient.html, /where we should send it/);
assert.match(recipient.html, /Add shipping info/);
assert.match(recipient.html, /margin:36px auto 20px/);
assert.match(recipient.html, /gift\/claim\?token=abc/);
assert.match(recipient.html, /Latke kit/);
assert.match(recipient.html, /grapejuice-wordmark-on-white/);

assert.equal(shouldEmailGiftSender('ships'), false);
assert.equal(shouldEmailGiftSender('no_address'), true);
assert.equal(shouldEmailGiftSender('owes_addons'), true);
const sender = renderGiftSenderEmail({ boxUrl: 'https://grapejuice.co/my-gifts/box/invite-1' });
assert.equal(sender.subject, "The box you gifted hasn't been accepted yet");
assert.match(sender.html, /We tried reaching them, but didn't hear back/);
assert.match(sender.html, /give them a nudge/);
assert.match(sender.html, /We still need a few things from them/);
assert.match(sender.html, /Review my gift/);
assert.match(sender.html, /my-gifts\/box\/invite-1/);
assert.equal(/still ships|will not ship|add-ons/i.test(sender.html), false);

const docs = join(__dirname, '../../docs');
writeFileSync(join(docs, 'customerio-gift-unclaimed-recipient.html'), recipient.html);
writeFileSync(join(docs, 'customerio-gift-unclaimed-sender.html'), sender.html);

console.log('giftUnclaimed tests passed');
