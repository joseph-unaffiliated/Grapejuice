/**
 * Draft Passover page copy — paraphrase of PASSOVER_PAGE_VOICE_NOTE_CLEANED.md
 * + early passover-2027.html structure (roadmap).
 */

import {
  HANUKKAH_2027_NOTIFY_INTEREST,
  HIGH_HOLIDAYS_SUKKOT_2027_INTEREST,
  PASSOVER_NOTIFY_INTEREST,
} from './pilotHolidays';

export const PASSOVER_COPY = {
  crumb: '2027 Passover',
  eyebrow: 'Passover 2027',
  title: 'A Passover box for your family, built by your family.',
  lead: [
    'Passover is the holiday of spring and freedom. It’s an opportunity to tell the Jewish origin story, drink, sing, play games, and eat until you couldn’t possibly eat any more.',
    'With an agenda that is at once highly structured and extremely customizable, traditions meant to invite curiosity, and a focus on engaging children, it’s no surprise that Passover is one of the most practiced Jewish holidays among families around the world.',
    'Pre-register now and get discounts for your Passover box when the collection is released',
  ],
  whatsInTheBox: {
    heading: 'What comes in the Passover box?',
    body:
      'We’re just in the early stages of shaping the Passover collection. But here is an early sense of what might come in the box: Matzah. Bitter herbs. A make-your-own seder plate. Grapejuice. A Haggadah. Puppets of the Ten Plagues. Design-your-own Afikomen bag. Books telling the Passover story...',
  },
  roadmap: {
    heading: 'Hanukkah, Passover, and then what?',
    groups: [
      {
        items: [
          {
            when: 'December 4–12, 2026',
            what: 'Hanukkah',
            ctaLabel: 'Start my box',
            ctaAction: 'startBox' as const,
          },
          {
            when: 'April 21–29, 2027',
            what: 'Passover',
            ctaLabel: 'Pre-register',
            ctaAction: 'preRegister' as const,
            ctaVariant: 'primary' as const,
            interestKey: PASSOVER_NOTIFY_INTEREST,
          },
          {
            when: 'October 2–23, 2027',
            what: 'High Holidays + Sukkot',
            ctaLabel: 'Pre-register',
            ctaAction: 'preRegister' as const,
            interestKey: HIGH_HOLIDAYS_SUKKOT_2027_INTEREST,
          },
          {
            // Hebcal: 1 Candle → 8th Day
            when: 'December 24, 2027 – January 1, 2028',
            what: 'Hanukkah',
            ctaLabel: 'Pre-register',
            ctaAction: 'preRegister' as const,
            interestKey: HANUKKAH_2027_NOTIFY_INTEREST,
          },
          {
            when: 'February 12, 2028',
            what: 'Tu B’Shevat',
          },
          {
            when: 'March 12, 2028',
            what: 'Purim',
          },
          {
            // Hebcal: Erev Pesach → Pesach VIII (same span style as Passover 2027)
            when: 'April 10–18, 2028',
            what: 'Passover',
          },
          {
            when: 'May 14, 2028',
            what: 'Lag B’Omer',
          },
        ],
      },
    ],
  },
  /** Hero primary CTA label (roadmap rows use their own ctaLabels). */
  primaryCta: 'Pre-register now',
  lunarCycle: {
    heading: 'Want to learn more about the Jewish calendar?',
    ctaLabel: 'Explore Lunar Cycle',
    url: 'https://lunarcycle.io/',
  },
} as const;
