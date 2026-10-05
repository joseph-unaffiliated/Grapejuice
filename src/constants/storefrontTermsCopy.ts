/**
 * Grapejuice terms — Grapejuice purchase terms layered on unaffiliated.co/terms/network,
 * which supplies the general legal provisions (arbitration, liability, etc.).
 */

import type { LegalPageCopy } from '../components/storefront/StorefrontLegalPage';

export const TERMS_COPY: LegalPageCopy = {
  eyebrow: 'Legal',
  title: 'Terms of Use and Sale',
  lead: [
    'Last updated: October 5, 2026',
    'These terms are an agreement between you and Unaffiliated Inc. (“we”, “us”), which makes Grapejuice through its Untraditional brand. They cover grapejuice.co, the Grapejuice app, our emails, and anything you buy from us (together, the “Services”).',
    [
      { body: 'Please read section 11. ', weight: 'semibold' },
      'It includes the mandatory arbitration, class action waiver and jury waiver provisions of the Unaffiliated Terms of Use, which apply to Grapejuice.',
    ],
  ],
  sections: [
    {
      heading: '1. Using Grapejuice',
      body: [
        'You must be 18 or older to create an account or buy from us. You are responsible for keeping your sign-in details secure and for activity on your account. Our Privacy Policy at grapejuice.co/privacy explains how we handle your information.',
      ],
    },
    {
      heading: '2. Building your box',
      body: [
        'You can build and change a Hanukkah box for your family. Each season has a lock date, shown in the app; you can keep swapping items and adding extras until then. After the lock date we prepare your box and it can no longer be changed.',
        'Item suggestions, including those from Ask Rav, our AI shopping assistant, are suggestions only. They can be wrong. Please check that each item suits the children it is for, including age guidance and food allergens listed on product pages and packaging.',
        'If an item becomes unavailable before your box ships, we may replace it with a comparable item.',
      ],
    },
    {
      heading: '3. Prices and payment',
      body: [
        'Prices are in US dollars and are shown when you build your box and at checkout, including any cost for additional children, add-ons or expedited shipping. Applicable taxes are added at checkout.',
        'When you commit to a box, you save a payment card with our payment processor, Stripe, and authorize us to charge it for your box. You are not charged until your box is prepared to ship after the lock date. If the charge fails and we cannot reach you to fix it, we may not ship your box. Items bought individually through checkout are charged when you place the order.',
        'We may correct pricing errors. If we find an error after you commit, we will tell you before charging and you can cancel.',
      ],
    },
    {
      heading: '4. Canceling',
      body: [
        'You can cancel a committed box at no charge any time before the lock date from Orders in your account or by emailing hello@grapejuice.co.',
      ],
    },
    {
      heading: '5. Gifts and credits',
      body: [
        'If you buy a Grapejuice box as a gift, you pay for the box and standard shipping. The recipient can customize it until the lock date; if they choose paid extras or expedited shipping, they pay for those. Please make sure the recipient’s details and shipping address are correct.',
        'Gift balances, promotional credits and rewards (such as credit for completing a feedback survey) can only be used on Grapejuice, have no cash value, cannot be transferred or resold, and are subject to any conditions and expiration dates shown with the offer.',
      ],
    },
    {
      heading: '6. Shipping',
      body: [
        'We currently ship only to addresses in the United States. Standard shipping is free unless stated otherwise. Delivery dates we show are estimates, not guarantees, although we work hard to get every box to you before Hanukkah.',
      ],
    },
    {
      heading: '7. Damaged, missing or wrong items',
      body: [
        'Because each box is put together for your family, we do not accept returns of boxes or opened items. If anything arrives damaged, is missing, or is not what you chose, or if your package is lost, email hello@grapejuice.co within 30 days of delivery (with a photo if you can) and we will refund it.',
        'Nothing in these terms limits rights you have under consumer protection laws that cannot be waived.',
      ],
    },
    {
      heading: '8. Product safety',
      body: [
        'Some items, such as candles, menorahs, small toys and food, need adult supervision. Follow the instructions and warnings on each product. Never leave lit candles unattended.',
      ],
    },
    {
      heading: '9. Emails and messages',
      body: [
        'We send emails about your account, orders and gifts. With your permission, or where the law allows, we also send marketing emails about Grapejuice; every marketing email includes an unsubscribe link.',
      ],
    },
    {
      heading: '10. Our content and acceptable use',
      body: [
        'The Grapejuice name, site, app, designs, text and images belong to us or our licensors. You may use the Services only for lawful, personal, non-commercial purposes. Do not misuse the Services, interfere with them, scrape them, resell our products without permission, or use Ask Rav to generate harmful content. We may suspend or close accounts that break these terms.',
      ],
    },
    {
      heading: '11. Unaffiliated Terms of Use',
      body: [
        'The Unaffiliated Terms of Use at unaffiliated.co/terms/network also apply to Grapejuice and are part of these terms. That includes their sections on disclaimers of warranties and limitation of liability, indemnification, mandatory arbitration, the class action and jury waivers, and how updates take effect. Where those terms refer to the privacy policy, our Grapejuice Privacy Policy applies instead. If these Grapejuice terms conflict with the Unaffiliated Terms of Use about your purchases, these Grapejuice terms control.',
      ],
    },
    {
      heading: '12. Changes',
      body: [
        'We may update these terms. We will post the new version here and update the date at the top. Changes do not affect orders you have already committed to, except where the law requires.',
      ],
    },
    {
      heading: '13. Contact us',
      body: [
        'Orders, shipping and questions: hello@grapejuice.co. Legal notices: legal@unaffiliated.co.',
      ],
    },
  ],
};
