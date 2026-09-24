/**
 * Draft How to light Hanukkah candles — paraphrase of PDP_VOICE_NOTE_CLEANED.md Part B module.
 */

export const HOW_TO_LIGHT_CANDLES_COPY = {
  crumb: 'How to light candles',
  eyebrow: 'Hanukkah',
  title: 'How to light the hanukkiah',
  lead:
    'Place it where it can be seen if it’s safe. Shamash in the center every night. Night candles from the right; light new to old. Blessing, songs, and what comes after are yours to choose.',
  placement: {
    heading: 'Where to put it',
    body:
      'Place your hanukkiah where it’s visible from the street, ideally. If you don’t have that setup — or it isn’t safe — don’t worry. Use as many as you like; some families light one per person.',
  },
  shamash: {
    heading: 'The shamash',
    body:
      'Each night, the candle in the central holder is the shamash — the only candle used for anything other than looking. Use it to light the others.',
  },
  firstNight: {
    heading: 'First night',
    items: [
      {
        title: 'Place',
        body:
          'Put one candle on the far right. (In a window, from outside that can look like the left.) Secure candles — melt the bottom a little or use sticky wax if you need to.',
      },
      {
        title: 'Light the shamash',
        body: 'Pick up the shamash and light it with a match or lighter.',
      },
      {
        title: 'Light the night candle',
        body: 'Use the shamash to light the night’s candle, then place the shamash back in its holder.',
      },
    ],
  },
  songs: {
    heading: 'Three sung pieces (optional)',
    body:
      'One prayer, two songs. Do all, some, or none — every family figures out what feels right.',
    items: [
      {
        title: 'The blessing',
        body: 'Makes holy this sacred act of lighting the candles.',
      },
      {
        title: 'Maoz Tzur',
        body:
          'Gratitude and redemption; it also tells the Hanukkah story. It’s long — many families do the first stanza only, or first and last.',
      },
      {
        title: 'These candles we light',
        body:
          'For miracles, wonderful things, bravery, redemption — then and still today. (Often called Haneirot Halalu.)',
      },
    ],
  },
  after: {
    heading: 'After lighting',
    body:
      'There’s no right order. Presents, latkes and sufganiyot, dreidel, or go deeper on the story and prayer themes. All of those every night, or one focus per night — up to you.',
  },
  nights2to8: {
    heading: 'Nights 2–8',
    body:
      'Shamash in the center. That night’s candles go on the far right (so night eight fills the whole row). Light the newest candle first, then toward the older ones — left to right. Place the shamash back after. Multiple hanukkiahs? Light them all at once, or take turns.',
  },
  visuals: [
    { label: 'Illustration TBD — first-night placement', aspectRatio: 16 / 9 },
    { label: 'Illustration TBD — light new → old', aspectRatio: 4 / 3 },
  ],
} as const;
