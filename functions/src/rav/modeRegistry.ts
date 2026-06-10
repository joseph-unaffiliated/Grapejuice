import type { RavModeName } from './types';
import {
  FACILITATOR_JSON_INSTRUCTIONS,
  FACILITATOR_SYSTEM,
} from './modes/facilitator';
import {
  PERSONAL_SHOPPER_JSON_INSTRUCTIONS,
  PERSONAL_SHOPPER_SYSTEM,
} from './modes/personalShopper';
import {
  PROJECT_PARTNER_JSON_INSTRUCTIONS,
  PROJECT_PARTNER_SYSTEM,
} from './modes/projectPartner';
import {
  FACILITATOR_KID_JSON_INSTRUCTIONS,
  FACILITATOR_KID_SYSTEM,
} from './modes/facilitatorKid';

export type RavModeConfig = {
  systemPrompt: string;
  jsonInstructions: string;
};

const MODES: Record<RavModeName, RavModeConfig> = {
  facilitator: {
    systemPrompt: FACILITATOR_SYSTEM,
    jsonInstructions: FACILITATOR_JSON_INSTRUCTIONS,
  },
  personal_shopper: {
    systemPrompt: PERSONAL_SHOPPER_SYSTEM,
    jsonInstructions: PERSONAL_SHOPPER_JSON_INSTRUCTIONS,
  },
  project_partner: {
    systemPrompt: PROJECT_PARTNER_SYSTEM,
    jsonInstructions: PROJECT_PARTNER_JSON_INSTRUCTIONS,
  },
  facilitator_kid: {
    systemPrompt: FACILITATOR_KID_SYSTEM,
    jsonInstructions: FACILITATOR_KID_JSON_INSTRUCTIONS,
  },
};

export function resolveRavMode(mode?: string): RavModeName {
  if (mode === 'personal_shopper' || mode === 'project_partner' || mode === 'facilitator_kid') {
    return mode;
  }
  return 'facilitator';
}

export function getRavModeConfig(mode?: string): RavModeConfig {
  return MODES[resolveRavMode(mode)];
}
