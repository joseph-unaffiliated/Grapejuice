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
  senderFollowUpCopy,
  unclaimedGiftNoteDue,
} from './giftUnclaimed';

const now = Date.parse('2026-11-06T15:00:00.000Z');
const dayAgo = new Date(now - 86_400_000).toISOString();
const hourAgo = new Date(now - 3_600_000).toISOString();
const LATKE = 'https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/catalog/hanukkah/items/latke-kit/primary-0-fad2029b3c90.webp';

assert.equal(
  unclaimedGiftNoteDue({ paid: true, status: 'pending', recipientSentAt: null, senderSentAt: null, now }),
  'recipient'
);
assert.equal(
  unclaimedGiftNoteDue({ paid: true, status: 'pending', recipientSentAt: hourAgo, senderSentAt: null, now }),
  null
);
assert.equal(
  unclaimedGiftNoteDue({ paid: true, status: 'pending', recipientSentAt: dayAgo, senderSentAt: null, now }),
  'sender'
);
assert.equal(
  unclaimedGiftNoteDue({ paid: true, status: 'claimed', recipientSentAt: dayAgo, senderSentAt: null, now }),
  null
);
assert.equal(
  unclaimedGiftNoteDue({ paid: false, status: 'pending', recipientSentAt: null, senderSentAt: null, now }),
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
assert.match(recipient.html, /Naomi/);
assert.match(recipient.html, /gift\/claim\?token=abc/);
assert.match(recipient.html, /Latke kit/);
assert.match(recipient.html, /Finish receiving it/);
assert.match(recipient.html, /grapejuice-wordmark-on-white/);

const ships = renderGiftSenderEmail({
  recipientName: 'Sam',
  reason: 'ships',
  boxUrl: 'https://grapejuice.co/gift/give',
});
assert.match(ships.html, /Follow up with them directly/);
assert.match(ships.html, /still ships/);
assert.match(ships.html, /tax is waived/i);
assert.match(senderFollowUpCopy('no_address'), /will not ship/);
assert.match(senderFollowUpCopy('owes_addons'), /will not ship/);
assert.match(senderFollowUpCopy('owes_addons'), /add-ons/);
const held = renderGiftSenderEmail({
  recipientName: 'Sam',
  reason: 'owes_addons',
  boxUrl: 'https://grapejuice.co/gift/give',
});
assert.match(held.html, /will not ship/);
assert.match(held.html, /add-ons/);

const docs = join(__dirname, '../../docs');
writeFileSync(join(docs, 'customerio-gift-unclaimed-recipient.html'), recipient.html);
writeFileSync(join(docs, 'customerio-gift-unclaimed-sender.html'), ships.html);
writeFileSync(join(docs, 'customerio-gift-unclaimed-sender-held.html'), held.html);

console.log('giftUnclaimed tests passed');
