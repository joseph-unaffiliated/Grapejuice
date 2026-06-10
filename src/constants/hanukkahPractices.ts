/** Key Hanukkah practices — the pillars the curated box is organized around. */
export type HanukkahPractice = {
  id: string;
  title: string;
  /** Short reassurance: doing this is enough. */
  tagline: string;
  /** Why families do this — accessible, no jargon. */
  description: string;
  /** Materials included in the box for this practice. */
  boxItems: string[];
};

export const HANUKKAH_PRACTICES: HanukkahPractice[] = [
  {
    id: 'candles',
    title: 'Light candles',
    tagline: 'One more each night — that counts.',
    description:
      'The heart of Hanukkah: gather around the hanukkiah, light one more candle each night, and pause together. You do not need a perfect blessing — the printed guide in your box walks you through it.',
    boxItems: ['Hanukkah candles', '8-night parent guide', 'Blessing lyric sheet'],
  },
  {
    id: 'latkes',
    title: 'Eat latkes or sufganiyot',
    tagline: 'Fried food is the tradition.',
    description:
      'Oil is the theme — crispy latkes or jelly doughnuts. Pick your treat path when you customize your box; we include the mix, recipe, or kit to actually make it happen.',
    boxItems: ['Latke mix or sufganiyot kit', 'Recipe card', 'Cooking playlist'],
  },
  {
    id: 'story',
    title: 'Tell the story',
    tagline: 'Kid-sized, not a sermon.',
    description:
      'The Maccabees, the oil that lasted eight nights — a story or activity matched to each kid. Read it, listen together, or hand them something to do while you talk.',
    boxItems: ['Per-kid story pick', 'Parent discussion prompts', 'Age-matched format'],
  },
  {
    id: 'dreidel',
    title: 'Play dreidel',
    tagline: 'A simple game anyone can join.',
    description:
      'Spin, win chocolate gelt, laugh. Especially good on nights when you want something easy after candles — no prep, no performance.',
    boxItems: ['Chocolate gelt', 'Dreidel or kid gift pick', 'How-to in your guide'],
  },
];

export const HANUKKAH_PRACTICES_INTRO =
  'Hanukkah at home comes down to a few practices. Do these and you have done enough — your box includes the materials for each.';
