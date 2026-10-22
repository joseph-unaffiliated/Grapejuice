/**
 * Run: node -e "require('sucrase/register/ts'); require('./functions/src/program/decideNext.test.ts')"
 */
import assert from 'node:assert/strict';
import { applyDecision, decideNext, lifetimeProgramSends, type DecideInput, type DecideResult } from './decideNext';
import { inPilotWindow } from './time';

const LOCK = '2026-11-07T15:00:00.000Z';

function person(over: Partial<DecideInput> = {}): DecideInput {
  return {
    now: '2026-10-22T14:30:00.000Z',
    lockAt: LOCK,
    stopped: false,
    track: 'coupon',
    preFacelift: false,
    reachedPayment: false,
    anchorAt: '2026-10-22T14:30:00.000Z',
    draftTouchedAt: null,
    enrolled: false,
    pilotEmailedAt: null,
    pilotFollowUpAt: null,
    pilotD7At: null,
    sends: [],
    swapDue: false,
    lowStockDue: false,
    liveAbandonerDue: false,
    surveyDue: false,
    ...over,
  };
}

function run(start: DecideInput, ticks: string[]): DecideResult[] {
  const out: DecideResult[] = [];
  let state = start;
  for (const now of ticks) {
    state = { ...state, now };
    const result = decideNext(state);
    out.push(result);
    state = applyDecision(state, result);
  }
  return out;
}

const morning = (isoDate: string) => `${isoDate}T14:30:00.000Z`;
const COUPON_DAYS = ['2026-10-22', '2026-10-25', '2026-10-29', '2026-10-31', '2026-11-04', '2026-11-06'];

assert.equal(inPilotWindow('2026-10-22T14:30:00.000Z'), true);
assert.equal(inPilotWindow('2026-10-23T14:30:00.000Z'), false);
assert.equal(inPilotWindow('2026-10-25T22:00:00.000Z'), true);

// Coupon track: recap, offer, proof, T-7, T-3 merged with free shipping, T-1.
{
  const results = run(person(), COUPON_DAYS.map(morning));
  const sent = results.filter((r) => r.action === 'send');
  assert.deepEqual(
    sent.map((r) => (r.action === 'send' ? `${r.stage}${r.merged.length ? '+' + r.merged.join('+') : ''}` : '')),
    ['d1', 'd4', 'd8', 'lock_t7', 'lock_t3+wave2', 'lock_t1']
  );
}

// S6 replaces the first coupon email's variant and does not add a second email.
{
  const result = decideNext(person({ preFacelift: true }));
  assert.equal(result.action, 'send');
  if (result.action === 'send') {
    assert.equal(result.stage, 'd1');
    assert.match(result.variant, /s6/);
    assert.equal(result.merged.length, 0);
  }
}

// Pilot + S6 + already reached payment: one invite, then follow-ups only inside the window.
{
  const ticks = [
    '2026-10-22T14:30:00.000Z',
    '2026-10-23T14:30:00.000Z',
    '2026-10-25T22:00:00.000Z',
    '2026-10-29T14:30:00.000Z',
    '2026-11-04T15:30:00.000Z',
    '2026-11-06T15:30:00.000Z',
  ];
  const results = run(
    person({
      track: 'pilot',
      preFacelift: true,
      reachedPayment: true,
      anchorAt: '2026-10-22T14:30:00.000Z',
    }),
    ticks
  );
  const sent = results.filter((r) => r.action === 'send');
  assert.equal(sent.length, 5);
  assert.equal(sent[0]?.action, 'send');
  if (sent[0]?.action === 'send') {
    assert.equal(sent[0].stage, 'pilot_invite');
    assert.match(sent[0].variant, /s6/);
    assert.match(sent[0].variant, /was_at_payment/);
  }
  assert.equal(results[1]?.action, 'none');
  if (results[1]?.action === 'none') assert.equal(results[1].reason, 'nothing_due');
  const stages = sent.map((r) => (r.action === 'send' ? r.stage : ''));
  assert.deepEqual(stages, ['pilot_invite', 'pilot_d3', 'pilot_d7', 'lock_t3', 'lock_t1']);
}

// Already emailed on Oct 16: enter at the follow-up, not a second invite.
{
  const result = decideNext(
    person({
      now: '2026-10-22T14:30:00.000Z',
      track: 'pilot',
      anchorAt: '2026-10-16T16:00:00.000Z',
      pilotEmailedAt: '2026-10-16T20:00:00.000Z',
    })
  );
  assert.equal(result.action, 'send');
  if (result.action === 'send') assert.equal(result.stage, 'pilot_d3');
}

// Live abandoner beats the offer, then holds the drip for 72h.
{
  const first = decideNext(
    person({
      now: '2026-10-23T22:00:00.000Z',
      sends: [{ stage: 'd1', at: '2026-10-22T14:30:00.000Z', marketing: true }],
      liveAbandonerDue: true,
      draftTouchedAt: '2026-10-23T18:00:00.000Z',
    })
  );
  assert.equal(first.action, 'send');
  if (first.action === 'send') assert.equal(first.stage, 'abandoner');
  const held = decideNext(
    person({
      now: '2026-10-25T14:30:00.000Z',
      sends: [
        { stage: 'd1', at: '2026-10-22T14:30:00.000Z', marketing: true },
        { stage: 'abandoner', at: '2026-10-23T22:00:00.000Z', marketing: true },
      ],
    })
  );
  assert.equal(held.action, 'none');
  assert.equal(held.action === 'none' && held.reason, 'abandoner_hold');
}

// A blocked D1 is skipped, not delivered late on top of D4.
{
  const skipped = decideNext(person({ now: '2026-10-25T14:30:00.000Z', anchorAt: '2026-10-22T14:30:00.000Z' }));
  assert.equal(skipped.action, 'skip');
  if (skipped.action === 'skip') assert.equal(skipped.stage, 'd1');
  const next = decideNext(
    applyDecision(person({ now: '2026-10-26T14:30:00.000Z', anchorAt: '2026-10-22T14:30:00.000Z' }), skipped)
  );
  assert.equal(next.action, 'send');
  if (next.action === 'send') assert.equal(next.stage, 'd4');
}

// Commit stops everything, including a lock day.
{
  const result = decideNext(person({ now: '2026-11-06T15:30:00.000Z', stopped: true }));
  assert.equal(result.action, 'none');
  if (result.action === 'none') assert.equal(result.reason, 'stopped');
}

// Sold-out swap still goes out the same day as another email.
{
  const result = decideNext(
    person({
      swapDue: true,
      sends: [{ stage: 'd1', at: '2026-10-22T14:30:00.000Z', marketing: true }],
    })
  );
  assert.equal(result.action, 'send');
  if (result.action === 'send') {
    assert.equal(result.stage, 'swap');
    assert.equal(result.marketing, false);
  }
}

// Enrolled pilots are not offered the coupon sequence.
{
  const result = decideNext(person({ track: 'pilot', enrolled: true, now: '2026-10-22T14:30:00.000Z' }));
  assert.equal(result.action, 'none');
}

// Lifetime cap ignores lock emails.
{
  const sends = [
    { stage: 'd1' as const, at: '2026-10-22T14:30:00.000Z', marketing: true },
    { stage: 'd4' as const, at: '2026-10-25T14:30:00.000Z', marketing: true },
    { stage: 'd8' as const, at: '2026-10-29T14:30:00.000Z', marketing: true },
    { stage: 'lock_t7' as const, at: '2026-10-31T14:30:00.000Z', marketing: true },
  ];
  assert.equal(lifetimeProgramSends(sends), 3);
}

// Survey is outside the conversion cap and does not fire while a drip step is due.
{
  const during = decideNext(person({ surveyDue: true }));
  assert.equal(during.action, 'send');
  if (during.action === 'send') assert.equal(during.stage, 'd1');
  const after = decideNext(
    person({
      now: '2026-12-10T15:30:00.000Z',
      surveyDue: true,
      track: 'pilot',
      enrolled: true,
      sends: [{ stage: 'pilot_invite', at: '2026-10-22T14:30:00.000Z', marketing: true }],
    })
  );
  assert.equal(after.action, 'send');
  if (after.action === 'send') assert.equal(after.stage, 'survey');
}

// FIFTEENOFF ends Nov 4, so the 15% email is not chosen after that day.
{
  const late = decideNext(
    person({
      now: '2026-11-05T15:00:00.000Z',
      sends: [{ stage: 'd1', at: '2026-10-22T14:30:00.000Z', marketing: true }],
    })
  );
  if (late.action === 'send' || late.action === 'skip') assert.notEqual(late.stage, 'd4');
}

console.log('decideNext tests passed');
