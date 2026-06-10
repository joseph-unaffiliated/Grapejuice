export type RavModeName = 'facilitator' | 'facilitator_kid' | 'personal_shopper' | 'project_partner';

export type BeamMilestoneType = 'bat_mitzvah' | 'bar_mitzvah';

export type RavBlock = {
  type: 'product' | 'curation' | 'swap';
  title: string;
  body?: string;
  itemId?: string;
  slotId?: string;
  swapOptions?: string[];
};

export type RavDraftAction = {
  type: 'swap' | 'add' | 'remove';
  itemId: string;
  slotId?: string;
  childId?: string;
};

export type RavResponse = { text: string; blocks: RavBlock[]; actions?: RavDraftAction[] };

export type AskPilotRavData = {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  boxDraftSummary?: string;
  mode?: RavModeName;
  childId?: string;
};

export type LineItem = {
  slotId?: string;
  itemId?: string;
  label?: string;
  quantity?: number;
  childId?: string;
};
