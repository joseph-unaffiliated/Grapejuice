/** Five box sections — mirrors My Box / BOX_DISPLAY_SECTIONS and know-nothing defaults. */
export type HanukkahPractice = {
  id: string;
  title: string;
  /** Short reassurance: doing this is enough. */
  tagline: string;
  /** Why families do this — accessible, no jargon. */
  description: string;
  /** Materials included in the curated box for this section. */
  boxItems: string[];
};

export const HANUKKAH_PRACTICES: HanukkahPractice[] = [
  {
    id: 'candles',
    title: 'Light the Candles',
    tagline: 'One more candle each night.',
    description:
      'One more candle each night, until the whole window glows. Your guide walks you through the lighting and blessings, no Hebrew required.',
    boxItems: ['Hanukkah candles', '8-night parent guide', 'Blessing lyric sheet'],
  },
  {
    id: 'dreidel',
    title: 'Play Dreidel',
    tagline: 'Spin, win gelt, laugh.',
    description:
      'A game of chance with a story hidden in its four letters. Each kid gets their own dreidel, and chocolate gelt keeps the stakes sweet.',
    boxItems: ['Per-kid dreidel', 'Chocolate gelt', 'How-to in your guide'],
  },
  {
    id: 'food',
    title: 'Eat & Drink',
    tagline: 'Fried food is the tradition.',
    description:
      'Hanukkah celebrates oil, so fried food is practically required. We send latke and sufganiyot mixes, applesauce spice included.',
    boxItems: ['Latke mix', 'Sufganiyot mix'],
  },
  {
    id: 'story',
    title: 'Tell the Story',
    tagline: 'Kid-sized, not a sermon.',
    description:
      'The Maccabees, the oil that lasted, and standing up for what you believe. Each kid gets a book picked for their age.',
    boxItems: ['Per-kid story book', 'Age-matched pick'],
  },
  {
    id: 'presents',
    title: 'Give Presents',
    tagline: 'Something to wrap and share.',
    description:
      'A small gift for each kid, plus wrapping paper so it feels like a real present. Swap gifts anytime in My Box before your box locks.',
    boxItems: ['Per-kid gift', 'Wrapping paper'],
  },
];

export const HANUKKAH_PRACTICES_INTRO =
  'Your box is built around these five central Hanukkah traditions.';
