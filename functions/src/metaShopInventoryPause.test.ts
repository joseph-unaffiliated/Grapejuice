/**
 * Run: npx tsx functions/src/metaShopInventoryPause.test.ts
 */
import assert from 'node:assert/strict';
import { bindingNeedsPause, mergeShopAdBindings, DEFAULT_SHOP_AD_BINDINGS } from './metaShopInventoryPause';

assert.deepEqual(mergeShopAdBindings(DEFAULT_SHOP_AD_BINDINGS, undefined), DEFAULT_SHOP_AD_BINDINGS);
assert.deepEqual(mergeShopAdBindings(DEFAULT_SHOP_AD_BINDINGS, []), DEFAULT_SHOP_AD_BINDINGS);

{
  const merged = mergeShopAdBindings(DEFAULT_SHOP_AD_BINDINGS, [
    { adName: 'shop-arch-menorah', itemIds: ['arch-menorah'], adIds: ['111'] },
  ]);
  const arch = merged.find((b) => b.adName === 'shop-arch-menorah');
  assert.deepEqual(arch?.adIds, ['111']);
  assert.deepEqual(arch?.itemIds, ['arch-menorah']);
}

assert.equal(bindingNeedsPause([{ allowsPurchase: true }, { allowsPurchase: false }]), true);
assert.equal(bindingNeedsPause([{ allowsPurchase: true }, { allowsPurchase: true }]), false);
assert.equal(bindingNeedsPause([]), true);

console.log('metaShopInventoryPause: ok');
