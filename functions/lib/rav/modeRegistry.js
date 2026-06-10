"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRavMode = resolveRavMode;
exports.getRavModeConfig = getRavModeConfig;
const facilitator_1 = require("./modes/facilitator");
const personalShopper_1 = require("./modes/personalShopper");
const projectPartner_1 = require("./modes/projectPartner");
const facilitatorKid_1 = require("./modes/facilitatorKid");
const MODES = {
    facilitator: {
        systemPrompt: facilitator_1.FACILITATOR_SYSTEM,
        jsonInstructions: facilitator_1.FACILITATOR_JSON_INSTRUCTIONS,
    },
    personal_shopper: {
        systemPrompt: personalShopper_1.PERSONAL_SHOPPER_SYSTEM,
        jsonInstructions: personalShopper_1.PERSONAL_SHOPPER_JSON_INSTRUCTIONS,
    },
    project_partner: {
        systemPrompt: projectPartner_1.PROJECT_PARTNER_SYSTEM,
        jsonInstructions: projectPartner_1.PROJECT_PARTNER_JSON_INSTRUCTIONS,
    },
    facilitator_kid: {
        systemPrompt: facilitatorKid_1.FACILITATOR_KID_SYSTEM,
        jsonInstructions: facilitatorKid_1.FACILITATOR_KID_JSON_INSTRUCTIONS,
    },
};
function resolveRavMode(mode) {
    if (mode === 'personal_shopper' || mode === 'project_partner' || mode === 'facilitator_kid') {
        return mode;
    }
    return 'facilitator';
}
function getRavModeConfig(mode) {
    return MODES[resolveRavMode(mode)];
}
//# sourceMappingURL=modeRegistry.js.map