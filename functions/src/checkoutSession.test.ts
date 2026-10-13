import assert from 'node:assert/strict';
import {
  checkoutSessionFromStripeMetadata,
  checkoutSessionToStripeMetadata,
  classifyCheckoutSession,
} from './checkoutSession';

const IG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0';
const FB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';
const SAFARI_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const at = '2026-10-10T18:00:00.000Z';

// --- in-app browsers win over tags -------------------------------------------------------------

let v = classifyCheckoutSession({ at, ua: IG_UA, entry: { utm: { source: 'lifecycle', medium: 'email' } } });
assert.equal(v.channel, 'instagram');
assert.equal(v.device, 'mobile');
assert.equal(v.inferred, false);
assert.equal(classifyCheckoutSession({ at, ua: FB_UA, entry: null }).channel, 'facebook');

// --- the session's own entry --------------------------------------------------------------------

v = classifyCheckoutSession({ at, ua: MAC_CHROME, entry: { utm: { source: 'lifecycle', medium: 'email', campaign: 'lock_reminder' } } });
assert.deepEqual([v.channel, v.device, v.detail], ['email', 'desktop', 'lifecycle / lock_reminder']);
assert.equal(classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: { referrer: 'https://mail.google.com/' } }).channel, 'email');
assert.equal(classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: { fbclid: 'abc' } }).channel, 'meta');
assert.equal(classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: { utm: { source: 'ig' } } }).channel, 'instagram');
v = classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: { referrer: 'https://www.google.com/', landingPath: '/' } });
assert.deepEqual([v.channel, v.detail, v.inferred], ['organic', 'Referral: google.com', false]);
assert.equal(classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: { landingPath: '/' } }).detail, 'Direct');

// --- no entry recorded: a campaign click within 12 hours before ----------------------------------

const email2h = { utm: { source: 'retention', medium: 'email' }, at: '2026-10-10T16:00:00.000Z' };
const meta3d = { fbclid: 'x', at: '2026-10-07T16:00:00.000Z' };
v = classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: null }, [email2h, meta3d]);
assert.deepEqual([v.channel, v.inferred], ['email', true]);
v = classifyCheckoutSession({ at, ua: SAFARI_PHONE, entry: null }, [meta3d]);
assert.deepEqual([v.channel, v.inferred], ['organic', true]);
assert.equal(classifyCheckoutSession({ at, ua: null, entry: null }).device, null);

// --- Stripe metadata round trip ------------------------------------------------------------------

const md = checkoutSessionToStripeMetadata({ at, ua: SAFARI_PHONE, entry: { utm: { source: 'ig' }, landingPath: '/' } });
const back = checkoutSessionFromStripeMetadata(md, at);
assert.deepEqual(back, { at, ua: SAFARI_PHONE, entry: { utm: { source: 'ig' }, landingPath: '/' } });
assert.deepEqual(checkoutSessionFromStripeMetadata({ meta_ua: MAC_CHROME }, at), { at, ua: MAC_CHROME, entry: null, backfilled: true });
assert.equal(checkoutSessionFromStripeMetadata({ householdId: 'h' }, at), null);

console.log('checkoutSession tests passed');
