/**
 * Rav welcome quick-prompts — shared by the Rav tab chips and Home search typewriter.
 */
import { formatHanukkahWelcomeSubtext } from '../services/hanukkah/dates';

export type RavStarterChip = {
  lines: string[];
  message: string;
};

export function buildKidRavStarterChips(childName: string): RavStarterChip[] {
  const name = childName.trim() || 'friend';
  return [
    { lines: ['What should we do', 'tonight?'], message: 'What should we do tonight?' },
    { lines: ['Tell me about', 'Hanukkah candles'], message: 'Tell me about Hanukkah candles' },
    { lines: [`Hi Rav, I'm ${name}`], message: `Hi Rav, I'm ${name}` },
  ];
}

export function buildRavStarterChips(hanukkahStartsOn: string | null): RavStarterChip[] {
  const countdown = formatHanukkahWelcomeSubtext(hanukkahStartsOn);
  const planMessage =
    countdown.startsWith('Hanukkah is in') || countdown.startsWith('Night')
      ? `${countdown.replace(/\.$/, '')}, help me make a plan`
      : 'Help me make a Hanukkah plan';
  const commaIdx = planMessage.indexOf(',');
  const planLines =
    commaIdx >= 0
      ? [planMessage.slice(0, commaIdx + 1), planMessage.slice(commaIdx + 1).trim()]
      : [planMessage];

  return [
    { lines: planLines, message: planMessage },
    { lines: ["I'm looking for books", 'to read with my kids'], message: "I'm looking for books to read with my kids" },
    { lines: ['What should we do', 'on night 1?'], message: 'What should we do on night 1?' },
    { lines: ["We just had a baby, I don't", 'know where to start'], message: "We just had a baby, I don't know where to start" },
    { lines: ['Help me choose', 'latkes or sufganiyot'], message: 'Help me choose latkes or sufganiyot' },
    { lines: ['Ideas for kids', 'who are new to Hanukkah'], message: 'Ideas for kids who are new to Hanukkah' },
    { lines: ['I want to do a', 'family game night'], message: 'I want to do a family game night' },
  ];
}

/** Static messages for search faux-typing (Home + storefront). */
export const RAV_TYPEWRITER_PROMPTS: readonly string[] = [
  'What do I need for Hanukkah?',
  'Why does the date of Hanukkah change every year?',
  'Help me plan a Hanukkah party',
  'What is the right way to light candles?',
  'Is it called a Menorah or Hanukkiah?',
  'How do you play dreidel?',
  'Why do we eat Latkes on Hanukkah?',
  'Why does the Menorah go in the window?',
  'What is the story of Hanukkah?',
];
