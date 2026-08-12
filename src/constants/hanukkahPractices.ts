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
      'Gather around the hanukkiah and grow the glow for eight nights. Your guide walks through lighting and blessings — no Hebrew required.',
    boxItems: ['Hanukkah candles', '8-night parent guide', 'Blessing lyric sheet'],
  },
  {
    id: 'dreidel',
    title: 'Play Dreidel',
    tagline: 'Spin, win gelt, laugh.',
    description:
      'A classic table game for mixed ages. Each kid gets a dreidel sized to them; chocolate gelt keeps the pot friendly.',
    boxItems: ['Per-kid dreidel', 'Chocolate gelt', 'How-to in your guide'],
  },
  {
    id: 'food',
    title: 'Eat & Drink',
    tagline: 'Fried food is the tradition.',
    description:
      'Oil is the theme — latkes and sufganiyot. We include both mixes plus applesauce so you can cook either (or both) without hunting the store.',
    boxItems: ['Latke mix', 'Sufganiyot mix', 'Applesauce'],
  },
  {
    id: 'story',
    title: 'Tell the Story',
    tagline: 'Kid-sized, not a sermon.',
    description:
      'The Maccabees and the oil that lasted — a book matched to each kid’s age. Read a little each night or save the big book for night one.',
    boxItems: ['Per-kid story book', 'Age-matched pick'],
  },
  {
    id: 'presents',
    title: 'Give Presents',
    tagline: 'Something to wrap and share.',
    description:
      'A small gift for each kid plus wrapping so you can make it feel like a present. Swap gifts anytime in My Box before lock.',
    boxItems: ['Per-kid gift', 'Wrapping paper'],
  },
];

export const HANUKKAH_PRACTICES_INTRO =
  'Your box is built around five central Hanukkah traditions:';
