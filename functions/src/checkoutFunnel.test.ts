/**
 * Run: node -e "require('sucrase/register/ts'); require('./functions/src/checkoutFunnel.test.ts')"
 */
import assert from 'node:assert/strict';
import { recordCheckoutFunnelStep, validateCheckoutStepInput } from './checkoutFunnel';

// Validation: bad step + no error = reject; good inputs pass through.
assert.throws(() => validateCheckoutStepInput({ step: 'nope' }), /Invalid checkout step/);
assert.equal(validateCheckoutStepInput({ step: 'view' }).step, 'view');
assert.equal(validateCheckoutStepInput({ step: 'bogus', error: { stage: 'card', message: 'x' } }).step, null);
assert.deepEqual(validateCheckoutStepInput({ error: { stage: 'commit', message: 'boom' } }).error, {
  stage: 'commit',
  message: 'boom',
});
assert.equal(validateCheckoutStepInput({ step: 'view', error: { stage: 'nope', message: 'x' } }).error, null);
assert.equal(validateCheckoutStepInput({ commitAttempt: true }).commitAttempt, true);
assert.equal(validateCheckoutStepInput({ step: 'view', householdId: 'short' }).householdId, null);

type Doc = Record<string, unknown> | undefined;
function fakeDb(prior: Doc) {
  const writes: Array<{ data: Record<string, unknown> }> = [];
  const ref = {
    get: async () => ({ data: () => prior }),
    set: async (data: Record<string, unknown>) => {
      writes.push({ data });
    },
  };
  return { db: { doc: () => ref } as never, writes };
}

async function main() {
  // First view writes the step.
  {
    const { db, writes } = fakeDb(undefined);
    const out = await recordCheckoutFunnelStep(db, 'visitor-1', validateCheckoutStepInput({ step: 'view' }), null, () => null);
    assert.equal(out.ok, true);
    assert.equal(writes.length, 1);
    assert.ok((writes[0]!.data.steps as Record<string, string>).view);
  }
  // Repeat view with nothing new skips the write.
  {
    const prior = { steps: { view: '2026-10-20T00:00:00.000Z' }, createdAt: 'x' };
    const { db, writes } = fakeDb(prior);
    const out = await recordCheckoutFunnelStep(db, 'visitor-1', validateCheckoutStepInput({ step: 'view' }), null, () => null);
    assert.equal(out.skipped, 'unchanged');
    assert.equal(writes.length, 0);
  }
  // Errors always write (they accumulate server-side).
  {
    const prior = { steps: { view: '2026-10-20T00:00:00.000Z' }, createdAt: 'x' };
    const { db, writes } = fakeDb(prior);
    await recordCheckoutFunnelStep(
      db,
      'visitor-1',
      validateCheckoutStepInput({ error: { stage: 'card', message: 'Your card was declined.' } }),
      null,
      () => null
    );
    assert.equal(writes.length, 1);
    const errors = writes[0]!.data.errors as Record<string, { lastMessage: string }>;
    assert.equal(errors.card!.lastMessage, 'Your card was declined.');
  }
  console.log('checkoutFunnel tests passed');
}

void main();
