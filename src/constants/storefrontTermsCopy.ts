/**
 * Grapejuice terms — the full Unaffiliated network Terms of Use
 * (unaffiliated.co/terms/network) plus Grapejuice terms of sale in section 16.
 */

import type { LegalPageCopy } from '../components/storefront/StorefrontLegalPage';
import { NETWORK_TERMS_INTRO, NETWORK_TERMS_SECTIONS } from './unaffiliatedNetworkLegalCopy';

export const TERMS_COPY: LegalPageCopy = {
  eyebrow: 'Legal',
  title: 'Terms of Use and Sale',
  lead: ['Last update posted: October 5, 2026', 'Effective: October 5, 2026'],
  sections: [
    {
      body: [
        ...NETWORK_TERMS_INTRO,
        'Grapejuice — grapejuice.co, the Grapejuice app, our Grapejuice emails, and the boxes and products you buy from us — is one of our Sites and part of the Services, and these Terms apply to it. Section 16 contains additional terms for buying from Grapejuice. Grapejuice is made by Untraditional, an Unaffiliated brand.',
      ],
    },
    ...NETWORK_TERMS_SECTIONS,
    {
      heading: '16. Grapejuice Terms of Sale',
      body: [
        'This section applies when you use Grapejuice or buy from it. It adds to the rest of these Terms.',
        [{ body: 'a. Using Grapejuice', weight: 'semibold' }],
        'You must be 18 or older to create an account or buy from us. You are responsible for keeping your sign-in details secure and for activity on your account. For Grapejuice, our Privacy Policy at grapejuice.co/privacy explains how we handle your information.',
        [{ body: 'b. Building your box', weight: 'semibold' }],
        'You can build and change a Hanukkah box for your family. Each season has a lock date, shown in the app; you can keep swapping items and adding extras until then. After the lock date we prepare your box and it can no longer be changed.',
        'Item suggestions, including those from Ask Rav, our AI shopping assistant, are suggestions only. They can be wrong. Please check that each item suits the children it is for, including age guidance and food allergens listed on product pages and packaging.',
        'If an item becomes unavailable before your box ships, we may replace it with a comparable item.',
        [{ body: 'c. Prices and payment', weight: 'semibold' }],
        'Prices are in US dollars and are shown when you build your box and at checkout, including any cost for additional children, add-ons or expedited shipping. Applicable taxes are added at checkout.',
        'When you commit to a box, you save a payment card with our payment processor, Stripe, and authorize us to charge it for your box. You are not charged until your box is prepared to ship after the lock date. If the charge fails and we cannot reach you to fix it, we may not ship your box. Items bought individually through checkout are charged when you place the order.',
        'We may correct pricing errors. If we find an error after you commit, we will tell you before charging and you can cancel.',
        [{ body: 'd. Canceling', weight: 'semibold' }],
        'You can cancel a committed box at no charge any time before the lock date from Orders in your account or by emailing hello@grapejuice.co.',
        [{ body: 'e. Gifts and credits', weight: 'semibold' }],
        'If you buy a Grapejuice box as a gift, you pay for the box and standard shipping. The recipient can customize it until the lock date; if they choose paid extras or expedited shipping, they pay for those. Please make sure the recipient’s details and shipping address are correct.',
        'Gift balances, promotional credits and rewards (such as credit for completing a feedback survey) can only be used on Grapejuice, have no cash value, cannot be transferred or resold, and are subject to any conditions and expiration dates shown with the offer.',
        [{ body: 'f. Shipping', weight: 'semibold' }],
        'We currently ship only to addresses in the United States. Standard shipping is free unless stated otherwise. Delivery dates we show are estimates, not guarantees, although we work hard to get every box to you before Hanukkah.',
        [{ body: 'g. Damaged, missing or wrong items', weight: 'semibold' }],
        'Because each box is put together for your family, we do not accept returns of boxes or opened items. If anything arrives damaged, is missing, or is not what you chose, or if your package is lost, email hello@grapejuice.co within 30 days of delivery (with a photo if you can) and we will refund it.',
        'Nothing in these Terms limits rights you have under consumer protection laws that cannot be waived.',
        [{ body: 'h. Product safety', weight: 'semibold' }],
        'Some items, such as candles, menorahs, small toys and food, need adult supervision. Follow the instructions and warnings on each product. Never leave lit candles unattended.',
        [{ body: 'i. Emails and messages', weight: 'semibold' }],
        'We send emails about your account, orders and gifts. With your permission, or where the law allows, we also send marketing emails about Grapejuice; every marketing email includes an unsubscribe link.',
        [{ body: 'j. Acceptable use', weight: 'semibold' }],
        'You may use Grapejuice only for lawful, personal, non-commercial purposes. Do not resell our products without permission or use Ask Rav to generate harmful content. We may suspend or close accounts that break these Terms.',
        [{ body: 'k. How this section relates to the rest of these Terms', weight: 'semibold' }],
        'Where these Terms refer to our privacy policy, for Grapejuice the Grapejuice Privacy Policy at grapejuice.co/privacy applies. If this Section 16 conflicts with the rest of these Terms about your Grapejuice purchases, this Section 16 controls. Updates to these Terms do not affect orders you have already committed to, except where the law requires.',
        [{ body: 'l. Contact', weight: 'semibold' }],
        'Orders, shipping and questions: hello@grapejuice.co. Legal notices: legal@unaffiliated.co.',
      ],
    },
  ],
};
