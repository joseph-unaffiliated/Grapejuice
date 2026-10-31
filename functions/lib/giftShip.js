"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_SHIP_TAX_CENTS = void 0;
exports.unclaimedGiftShipDecision = unclaimedGiftShipDecision;
/** Tax on an unclaimed autoship is waived. Shipping is $0. Add-ons still owed are not. */
exports.AUTO_SHIP_TAX_CENTS = 0;
function unclaimedGiftShipDecision(input) {
    if (!input.addressComplete)
        return { ship: false, taxWaived: false, reason: 'no_address' };
    if (input.upgradeCents > 0)
        return { ship: false, taxWaived: false, reason: 'owes_addons' };
    return { ship: true, taxWaived: true, reason: 'ships' };
}
//# sourceMappingURL=giftShip.js.map