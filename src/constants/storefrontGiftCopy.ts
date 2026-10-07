import type { StorefrontArticleBeliefItem, StorefrontArticleStepItem } from '../components/storefront/StorefrontArticlePage';
import { formatCatalogDollars } from '../services/box/buildDefaultBox';
import { listBoxCentsForKids } from '../services/box/boxRules';
import { giftBoxPriceLine } from './giftCopy';

/** `/gift` landing — see docs/GIFT_LANDING_COPY.md. Dates come from live config (`Nov 7`, `Nov 21`, `Dec 5`). */
export type GiftLandingDates = {
  lockDay: string;
  arrivesBy: string;
  startsOn: string;
};

export function giftLandingCopy({ lockDay, arrivesBy, startsOn }: GiftLandingDates) {
  const price = giftBoxPriceLine();
  const oneKid = listBoxCentsForKids(1);
  const perExtraKid = listBoxCentsForKids(2) - oneKid;
  return {
    eyebrow: 'The gift of Hanukkah',
    title: 'Send them Hanukkah in a box',
    lead: 'One box with everything for the eight nights: candles, gelt, latke and sufganiyot mixes, and a book and a present for each kid. You pick, we ship it to their door, free.',
    primaryCta: 'Give a gift box',
    secondaryCta: 'Or send gift credit',
    smallPrint: `${formatCatalogDollars(oneKid)} covers a box with up to one kid, plus ${formatCatalogDollars(perExtraKid)} for each additional. Order by ${lockDay}; arrives by ${arrivesBy}. Hanukkah starts ${startsOn}.`,

    closed: {
      lead: `Gift boxes for this Hanukkah closed on ${lockDay}, and they're on their way to families now. You can still send gift credit to spend in the Grapejuice store.`,
      primaryCta: 'Send gift credit',
    },

    /** Video strip + "Each box includes" row (StorefrontBuildBoxStrip). */
    inside: {
      headline: 'give them all eight nights',
      body: 'Books and presents picked for each kid’s age, plus everything for the candles, the dreidel games and the latkes.',
      videoCta: 'Give a gift box',
      cta: 'Pick what goes in their box',
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
      body: 'Send it now. Give them the gift of one less thing to think about.',
      cta: 'Give a gift box',
    },
  };
}
