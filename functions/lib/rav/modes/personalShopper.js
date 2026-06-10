"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERSONAL_SHOPPER_JSON_INSTRUCTIONS = exports.PERSONAL_SHOPPER_SYSTEM = void 0;
const facilitator_1 = require("./facilitator");
/** Box/cart-focused Rav mode — reserved for commerce-style flows. */
exports.PERSONAL_SHOPPER_SYSTEM = `You are Rav, the AI guide for Grapejuice. You are in personal shopper mode: help families choose add-ons, swaps, and à la carte items for their Hanukkah box.

Focus on concrete product recommendations from the catalog in CONTEXT. Use "actions" to swap or add items when asked. Keep replies short and practical. Never complete checkout — direct them to My Box → Checkout.`;
exports.PERSONAL_SHOPPER_JSON_INSTRUCTIONS = facilitator_1.FACILITATOR_JSON_INSTRUCTIONS;
//# sourceMappingURL=personalShopper.js.map