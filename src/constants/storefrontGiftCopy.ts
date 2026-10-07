import type { StorefrontArticleBeliefItem, StorefrontArticleStepItem } from '../components/storefront/StorefrontArticlePage';
import { giftBoxPriceLine } from './giftCopy';

/** `/gift` landing — see docs/GIFT_LANDING_COPY.md. Dates come from live config (`Nov 7`, `Nov 21`, `Dec 5`). */
export type GiftLandingDates = {
  lockDay: string;
  arrivesBy: string;
  startsOn: string;
};

export function giftLandingCopy({ lockDay, arrivesBy, startsOn }: GiftLandingDates) {
  const price = giftBoxPriceLine();
  return {
    eyebrow: 'Give Hanukkah',
    title: 'Send them Hanukkah in a box',
    lead: 'One box with everything for the eight nights: candles, gelt, latke and sufganiyot mixes, and a book and a present for each kid. You pick, we ship it to their door, free.',
    primaryCta: 'Give a gift box',
    secondaryCta: 'Or send gift credit',
    smallPrint: `${price.charAt(0).toUpperCase()}${price.slice(1)}. Order by ${lockDay}; arrives by ${arrivesBy}. Hanukkah starts ${startsOn}.`,

    closed: {
      lead: `Gift boxes for this Hanukkah closed on ${lockDay}, and they're on their way to families now. You can still send gift credit to spend in the Grapejuice store.`,
      primaryCta: 'Send gift credit',
    },

    inside: {
      heading: "What's in the box",
      intro: 'Everything a family needs for the eight nights, sized to how many kids they have.',
      items: [
        { title: 'Candles', body: 'Beeswax candles for the eight nights.' },
        { title: 'A dreidel for each kid', body: 'A wooden dreidel for every kid, plus gelt to play for.' },
        {
          title: 'Latke and sufganiyot mixes',
          body: 'Mixes for latkes and sufganiyot (Hanukkah donuts), with applesauce spices in the latke kit.',
        },
        { title: 'A book for each kid', body: "A Hanukkah story picked for each kid's age." },
        {
          title: 'A present for each kid',
          body: 'A stuffie, a play menorah, a clay dreidel kit, make-your-own candles, or another book. You choose, or we match it to their age.',
        },
        { title: 'Wrapping paper', body: 'So the presents are ready to give.' },
      ] satisfies StorefrontArticleBeliefItem[],
      menorahNote: "A menorah isn't included (most families have one), but you can add one.",
    },

    howItWorks: {
      heading: 'How it works',
      steps: [
        { title: 'Tell us about the kids.', body: 'How many and how old, so the books and presents fit.' },
        { title: 'Look it over.', body: 'We fill the box for you. Swap anything you like, or leave it as is.' },
        {
          title: 'Add a note and their email.',
          body: 'We email them that a gift is on the way, with your message.',
        },
        {
          title: `They confirm where to send it by ${lockDay}.`,
          body: "They can keep it a surprise (sealed until it arrives) or open it and make small changes. Already know their address? Add it and we'll fill it in for them.",
        },
      ] satisfies StorefrontArticleStepItem[],
      after: `You pay when you send the gift. It ships free with all the Hanukkah boxes and arrives by ${arrivesBy}.`,
    },

    twoWays: {
      heading: 'Two ways to give',
      body: `Pick it for them: a curated Hanukkah box, chosen by you. Or let them choose: gift credit worth a box for their family, so their parents can build their own box or shop the store. Either way, it's ${price}.`,
      primaryCta: 'Give a gift box',
      secondaryCta: 'Send gift credit',
    },

    faq: {
      heading: 'Questions',
      items: [
        { title: 'When will I be charged?', body: 'When you send the gift.' },
        {
          title: 'When will it arrive?',
          body: `By ${arrivesBy}, well before Hanukkah starts on ${startsOn}. Gift boxes ship free with all the Hanukkah boxes.`,
        },
        {
          title: "What's the deadline?",
          body: `${lockDay}, for both of you: send the gift by ${lockDay}, and they confirm where to send it by ${lockDay}.`,
        },
        {
          title: 'Do they need to do anything?',
          body: `Yes, one quick step. We email them, they sign in and confirm where to send it by ${lockDay}. If you add their address, they just confirm it. Either way they can keep it a surprise.`,
        },
        {
          title: 'Can they change what\'s in it?',
          body: 'Yes. If they open it, they can swap items. If they add anything beyond what you covered, they pay the difference. They can also turn it into gift credit instead.',
        },
        { title: 'Is a menorah included?', body: 'No. Most families already have one, but you can add one to the box.' },
        { title: 'Can I cancel?', body: "Email hello@grapejuice.co and we'll sort it out." },
        {
          title: 'Do I need an account?',
          body: "Yes, a quick sign-up when you send the gift, so you can see when it's been claimed.",
        },
      ] satisfies StorefrontArticleBeliefItem[],
    },

    closing: {
      heading: `Hanukkah starts ${startsOn}`,
      body: "Send it now and it's one less thing for their December.",
      cta: 'Give a gift box',
    },
  };
}
