/**
 * Run: npx tsx src/services/mobileLayout/mobileLayoutRules.test.ts
 */
import assert from 'node:assert/strict';
import { mobileLayoutTag, parseMobileOverride, resolveMobileLayout } from './mobileLayoutRules';

// Desktop never gets the new layout, whatever the switch or override says.
assert.equal(resolveMobileLayout({ isCompact: false, enabled: true, override: null }), false);
assert.equal(resolveMobileLayout({ isCompact: false, enabled: true, override: 'new' }), false);

// Phone width follows the kill switch.
assert.equal(resolveMobileLayout({ isCompact: true, enabled: true, override: null }), true);
assert.equal(resolveMobileLayout({ isCompact: true, enabled: false, override: null }), false);
// Unknown (not loaded yet) counts as off, so a slow config read never flashes the new layout.
assert.equal(resolveMobileLayout({ isCompact: true, enabled: null, override: null }), false);

// Overrides: `control` always wins, `new` shows the layout even with the switch off (review).
assert.equal(resolveMobileLayout({ isCompact: true, enabled: true, override: 'control' }), false);
assert.equal(resolveMobileLayout({ isCompact: true, enabled: false, override: 'new' }), true);

assert.equal(parseMobileOverride('new'), 'new');
assert.equal(parseMobileOverride('control'), 'control');
assert.equal(parseMobileOverride('anything'), null);
assert.equal(parseMobileOverride(undefined), null);

assert.equal(mobileLayoutTag(true), 'new');
assert.equal(mobileLayoutTag(false), 'control');

console.log('mobileLayoutRules: ok');
