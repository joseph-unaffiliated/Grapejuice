/**
 * Rav welcome quick-prompts — shared by the Rav tab chips and Home search typewriter.
 */

export type RavStarterChip = {
  lines: string[];
  message: string;
};

/** Static messages for search faux-typing (Home + storefront) and welcome chips. */
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

export function buildKidRavStarterChips(childName: string): RavStarterChip[] {
  const name = childName.trim() || 'friend';
  return [
    { lines: ['What should we do', 'tonight?'], message: 'What should we do tonight?' },
    { lines: ['Tell me about', 'Hanukkah candles'], message: 'Tell me about Hanukkah candles' },
    { lines: [`Hi Rav, I'm ${name}`], message: `Hi Rav, I'm ${name}` },
  ];
}

/** Welcome chips — same Hanukkah prompts as the rotating search typewriter. */
export function buildRavStarterChips(_hanukkahStartsOn?: string | null): RavStarterChip[] {
  return [
    { lines: ['What do I need', 'for Hanukkah?'], message: RAV_TYPEWRITER_PROMPTS[0] },
    {
      lines: ['Why does the date of Hanukkah', 'change every year?'],
      message: RAV_TYPEWRITER_PROMPTS[1],
    },
    { lines: ['Help me plan', 'a Hanukkah party'], message: RAV_TYPEWRITER_PROMPTS[2] },
    {
      lines: ['What is the right way', 'to light candles?'],
      message: RAV_TYPEWRITER_PROMPTS[3],
    },
    {
      lines: ['Is it called a Menorah', 'or Hanukkiah?'],
      message: RAV_TYPEWRITER_PROMPTS[4],
    },
    { lines: ['How do you', 'play dreidel?'], message: RAV_TYPEWRITER_PROMPTS[5] },
    {
      lines: ['Why do we eat Latkes', 'on Hanukkah?'],
      message: RAV_TYPEWRITER_PROMPTS[6],
    },
    {
      lines: ['Why does the Menorah', 'go in the window?'],
      message: RAV_TYPEWRITER_PROMPTS[7],
    },
    { lines: ['What is the story', 'of Hanukkah?'], message: RAV_TYPEWRITER_PROMPTS[8] },
  ];
}
