/**
 * Draft How to play dreidel — paraphrase of PDP_VOICE_NOTE_CLEANED.md Part B module.
 */

export const HOW_TO_PLAY_DREIDEL_COPY = {
  crumb: 'How to play dreidel',
  eyebrow: 'Hanukkah',
  title: 'How to play dreidel',
  lead:
    'Equal gelt, ante into the pot, spin, and follow the letters. Youngest first is a suggestion — not a rule. Play until someone’s won it all, you’re done, or you just want to eat the chocolate.',
  whyWePlay: {
    heading: 'Why we play',
    body:
      'The story goes that in Maccabee times, telling Jewish stories was outlawed. Children would sit around telling those stories — and when soldiers came, they’d quickly pull out a dreidel and pretend they were just playing a silly little game. Today we play for fun, and chocolate, and to remember a time when telling the stories of our people was a criminal act.',
  },
  setup: {
    heading: 'Setup',
    body:
      'Give every player an equal value of coins or gelt. Already eaten the chocolate? Play with beans, Monopoly money, poker chips — whatever you’ve got.',
  },
  steps: {
    heading: 'How to play',
    items: [
      {
        title: 'Ante',
        body: 'Everybody puts one coin into the middle — the pot.',
      },
      {
        title: 'First spin',
        body: 'Someone spins. A gentle suggestion: youngest goes first.',
      },
      {
        title: 'Gimel',
        body:
          'Whoever spun the dreidel takes the whole pot. Then everybody adds another ante. (Gimel for gelt — gold in Yiddish.)',
      },
      {
        title: 'Hei',
        body: 'Whoever spun the dreidel takes half the pot (round up).',
      },
      {
        title: 'Nun',
        body: 'Whoever spun the dreidel wins nothing. Their turn is over. (Nun for nothing.)',
      },
      {
        title: 'Shin',
        body: 'Whoever spun the dreidel puts one more coin into the pot. Their turn is over.',
      },
      {
        title: 'Keep going',
        body:
          'Continue taking turns until one person has all the gelt, you run out of steam, or you just want to eat the chocolate.',
      },
    ],
  },
  letters: {
    heading: 'What the letters invite',
    body:
      'Nun, gimel, hei, shin are the first letters of Nes gadol haya sham — “a great miracle happened far away.” The point is for kids to ask: why? What do these letters mean? What was the miracle? That question should naturally invite story time.',
  },
  visuals: [
    { label: 'Illustration TBD — setup / pot', aspectRatio: 16 / 9 },
    { label: 'Illustration TBD — four letters', aspectRatio: 4 / 3 },
  ],
} as const;
