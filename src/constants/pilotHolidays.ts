import type { HolidayCard } from '../types/pilot';

export const PASSOVER_NOTIFY_INTEREST = 'passover-2027-notify';

export const PILOT_HOLIDAYS: HolidayCard[] = [
  {
    id: 'hanukkah-2026',
    title: 'Hanukkah 2026',
    gregorianDateLabel: 'Dec 5–12, 2026',
    explainer: 'Your live family box for eight nights of light, food, stories, and play.',
    status: 'active',
  },
  {
    id: 'passover-2027',
    title: 'Passover 2027',
    gregorianDateLabel: 'Apr 21–29, 2027',
    explainer: 'Pilot is notify-only for now. Join first access for the seder collection.',
    status: 'notify',
    notifyOnly: true,
  },
  {
    id: 'purim-2027',
    title: 'Purim 2027',
    gregorianDateLabel: 'Mar 23–24, 2027',
    explainer: 'A playful package for costumes, treats, and giving.',
    status: 'upcoming',
  },
  {
    id: 'shavuot-2027',
    title: 'Shavuot 2027',
    gregorianDateLabel: 'Jun 11–13, 2027',
    explainer: 'Learning + food rituals with low-prep family prompts.',
    status: 'upcoming',
  },
  {
    id: 'rosh-hashanah-2027',
    title: 'Rosh Hashanah 2027',
    gregorianDateLabel: 'Oct 2–4, 2027',
    explainer: 'A gentle reset kit for apples, honey, and intention setting.',
    status: 'upcoming',
  },
  {
    id: 'yom-kippur-2027',
    title: 'Yom Kippur 2027',
    gregorianDateLabel: 'Oct 11–12, 2027',
    explainer: 'Family reflection prompts and age-appropriate framing.',
    status: 'upcoming',
  },
  {
    id: 'sukkot-2027',
    title: 'Sukkot 2027',
    gregorianDateLabel: 'Oct 16–23, 2027',
    explainer: 'Outdoor meals and gratitude rituals you can actually do.',
    status: 'upcoming',
  },
  {
    id: 'hanukkah-2027',
    title: 'Hanukkah 2027',
    gregorianDateLabel: 'Dec 4–12, 2027',
    explainer: 'Next-year planning starts early. Keep what worked, swap what did not.',
    status: 'upcoming',
  },
];

export const PILOT_COPY = {
  homeTagline: 'A Hanukkah box that meets your family where you are.',
  myBoxStatus: 'Kit for this season. Collection for years ahead.',
  boxDetailTop: 'Refine your box',
  boxDetailPaymentPending:
    'Your box will not ship until you add payment information and a shipping address.',
  holidayCards: 'Tap interested holidays now so we can invite you first.',
  kitVsCollection: 'Your kit is for this year. Your collection grows each holiday.',
};

export type HomePhase = 'pre-order' | 'confirmed' | 'delivered' | 'during' | 'post';
