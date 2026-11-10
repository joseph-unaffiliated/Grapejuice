/**
 * Run: npx tsx src/hooks/storefrontHomeMode.parity.test.ts
 *
 * Admin personas must resolve through the same home-mode rules as Live —
 * they remap inputs only; they do not hard-code chrome modes.
 */
import assert from 'node:assert/strict';
import {
  homeModeArgsForPreview,
  resolveStorefrontHomeMode,
  type StorefrontHomeModeArgs,
} from '../services/storefront/resolveHomeMode';
import {
  PREVIEW_LOCKED_OPEN_ORDER,
  resolveEffectiveBoxLocked,
  resolvePreviewOpenOrder,
  shopHasBoxOrder,
} from '../services/storefront/resolveUserStatePreview';
import type { PilotOrder } from '../types/pilot';

const baseLive = (over: Partial<StorefrontHomeModeArgs> = {}): StorefrontHomeModeArgs => ({
  isAuthenticated: true,
  hasStartedBox: true,
  hasBoxLineItems: true,
  locked: false,
  canMutateBox: true,
  afterHanukkah: false,
  giftStatus: 'idle',
  giftKind: null,
  openOrder: null,
  ...over,
});

const unpaidDraft: PilotOrder = {
  ...PREVIEW_LOCKED_OPEN_ORDER,
  id: 'real-unpaid',
  status: 'draft',
};

const paidOpen: PilotOrder = {
  ...PREVIEW_LOCKED_OPEN_ORDER,
  id: 'real-paid',
  status: 'committed',
};

// Live unpaid draft after lock → shop, no Orders chrome
{
  const mode = resolveStorefrontHomeMode(
    baseLive({ locked: true, canMutateBox: false, openOrder: null })
  );
  assert.equal(mode, 'shop');
  assert.equal(shopHasBoxOrder(mode, null), false);
}

// Live paid box after lock → shop + Orders
{
  const mode = resolveStorefrontHomeMode(baseLive({ locked: true, openOrder: paidOpen }));
  assert.equal(mode, 'shop');
  assert.equal(shopHasBoxOrder(mode, paidOpen), true);
}

// Live customize before lock with open order
{
  const mode = resolveStorefrontHomeMode(baseLive({ locked: false, openOrder: paidOpen }));
  assert.equal(mode, 'customize');
}

// Persona signed_in_box after lock uses same resolver → shop (not forced customize)
{
  const live = baseLive({ locked: true, openOrder: null });
  const args = homeModeArgsForPreview('signed_in_box', live);
  assert.equal(args.locked, true);
  assert.equal(resolveStorefrontHomeMode(args), 'shop');
}

// Persona signed_in_needs_payment after lock → shop (same as real unpaid)
{
  const live = baseLive({ locked: true, canMutateBox: false, openOrder: null });
  const args = homeModeArgsForPreview('signed_in_needs_payment', live);
  assert.equal(args.canMutateBox, false);
  assert.equal(resolveStorefrontHomeMode(args), 'shop');
}

// Persona signed_in_no_box after lock → shop (cold)
{
  const live = baseLive({
    locked: true,
    hasStartedBox: false,
    hasBoxLineItems: false,
    openOrder: null,
  });
  const args = homeModeArgsForPreview('signed_in_no_box', live);
  assert.equal(args.hasBoxLineItems, false);
  assert.equal(resolveStorefrontHomeMode(args), 'shop');
}

// Persona signed_in_locked forces locked + open order stand-in → shop + Orders
{
  const open = resolvePreviewOpenOrder('signed_in_locked', null);
  assert.equal(open?.id, PREVIEW_LOCKED_OPEN_ORDER.id);
  const live = baseLive({ locked: true, openOrder: open });
  const args = homeModeArgsForPreview('signed_in_locked', live);
  assert.equal(args.locked, true);
  const mode = resolveStorefrontHomeMode(args);
  assert.equal(mode, 'shop');
  assert.equal(shopHasBoxOrder(mode, args.openOrder), true);
}

// Live null preview open order = real order only
{
  assert.equal(resolvePreviewOpenOrder(null, unpaidDraft), unpaidDraft);
  assert.equal(resolvePreviewOpenOrder('signed_in_box', unpaidDraft), unpaidDraft);
  assert.equal(resolvePreviewOpenOrder('signed_in_no_box', unpaidDraft), null);
}

// Personas no longer force-unlock against the calendar
{
  const lockAt = '2026-11-09T17:00:00.000Z';
  const after = new Date('2026-11-10T12:00:00.000Z');
  assert.equal(resolveEffectiveBoxLocked('signed_in_box', lockAt, after, false), true);
  assert.equal(resolveEffectiveBoxLocked('signed_in_needs_payment', lockAt, after, false), true);
  assert.equal(resolveEffectiveBoxLocked(null, lockAt, after, false), true);
  assert.equal(resolveEffectiveBoxLocked('signed_in_locked', lockAt, after, false), true);
}

// Pin pre-lock day → signed_in_box can still customize
{
  const before = new Date('2026-11-01T12:00:00.000Z');
  const lockAt = '2026-11-09T17:00:00.000Z';
  assert.equal(resolveEffectiveBoxLocked('signed_in_box', lockAt, before, false), false);
  const live = baseLive({ locked: false, openOrder: null, canMutateBox: true });
  assert.equal(
    resolveStorefrontHomeMode(homeModeArgsForPreview('signed_in_box', live)),
    'customize'
  );
}

console.log('storefrontHomeMode.parity.test.ts: ok');
