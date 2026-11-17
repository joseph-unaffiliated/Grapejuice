/**
 * Run: npx tsx src/services/admin/compStock.test.ts
 */
import assert from "node:assert/strict";
import { dashboardCaughtUp, shownCompLeft } from "./compStock";

// No anchor yet: show the dashboard number, even if a comp already holds one.
assert.equal(shownCompLeft(1, 1, undefined), 1);

// Live count said 0 at the moment comps held 1. Still held by that one person.
assert.equal(shownCompLeft(1, 1, { remaining: 0, held: 1 }), 0);

// Giving a second copy moves the live count down from the anchor.
assert.equal(shownCompLeft(1, 2, { remaining: 0, held: 1 }), -1);

// Taking it back returns to the anchor.
assert.equal(shownCompLeft(1, 0, { remaining: 0, held: 1 }), 1);

// Untracked stock stays untracked.
assert.equal(shownCompLeft(null, 3, { remaining: null, held: 3 }), null);

// Stale dashboard (still 1) has not caught the live 0. A matching or lower figure has.
assert.equal(dashboardCaughtUp(1, 0), false);
assert.equal(dashboardCaughtUp(0, 0), true);
assert.equal(dashboardCaughtUp(-1, 0), true);

console.log("compStock tests passed");
