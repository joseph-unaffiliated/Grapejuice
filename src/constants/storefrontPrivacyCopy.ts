/**
 * Grapejuice privacy policy — adapted from unaffiliated.co/privacy/network with
 * Grapejuice-specific disclosures (saved guest boxes, Retention.com, Ask Rav).
 * Keep in sync with docs/GUEST_BOX_RECOVERY.md when data flows change.
 */

export const PRIVACY_EMAIL = 'privacy@unaffiliated.co';

export const PRIVACY_COPY = {
  eyebrow: 'Legal',
  title: 'Privacy Policy',
  lead: [
    'Last updated: October 5, 2026',
    'This Privacy Policy explains how Unaffiliated Inc. (“we”, “us”) collects, uses, shares and protects personal information through Grapejuice — grapejuice.co, the Grapejuice app, and our Grapejuice emails (together, the “Services”). Grapejuice is made by Untraditional, an Unaffiliated brand.',
    `If you have any questions about this policy, email us at ${PRIVACY_EMAIL}.`,
  ],
  sections: [
    {
      heading: '1. Information we collect',
      body: [
        [{ body: 'Information you give us. ', weight: 'semibold' }, 'When you build a box, create an account, check out, send a gift or contact us, we collect your name, email address, phone number, shipping address and account sign-in details (including through Sign in with Google or Apple); your order history; gift details such as a recipient’s email address and your note to them; your answers to questions about your family’s traditions; and messages you send to Ask Rav or to our team.'],
        [{ body: 'Information about the children you shop for. ', weight: 'semibold' }, 'To build a box, a parent or other adult may tell us the first names, ages and interests of the children the box is for, along with the items chosen for them. First names are optional.'],
        [{ body: 'Payment information. ', weight: 'semibold' }, 'Payments are processed by Stripe. We receive limited details such as the card brand and last four digits, but we do not receive or store your full card number.'],
        [{ body: 'Information collected automatically. ', weight: 'semibold' }, 'We and our partners use cookies, local storage, pixels and similar technologies to collect information about your device and browser, rough location inferred from your IP address, the pages you view, the items you add to your box, and the ad or link that brought you to us. We also store a random visitor identifier in your browser so we can keep your box if you leave and come back.'],
        [{ body: 'Information from third parties. ', weight: 'semibold' }, 'We work with an identity partner, Retention.com, which may recognize visitors to grapejuice.co who have previously agreed to share their email address with its network. If we receive your email address this way, we may send you a small number of emails about the box you started or about Grapejuice. Every such email includes an unsubscribe link; unsubscribing stops them immediately. We never include children’s names in these emails. We may also receive information from advertising and analytics partners and from people who send you a Grapejuice gift.'],
      ],
    },
    {
      heading: '2. Saved boxes for visitors without an account',
      body: [
        'When you start building a Grapejuice box without signing in, we save your progress — including the first names, ages and interests you enter for the children the box is for, and the items you choose — so you can return to it. This information is stored for up to 60 days (longer if you reopen it) and is deleted when you create an account, which then holds the box, or on request.',
      ],
    },
    {
      heading: '3. How we use information',
      body: [
        'We use the information described above to:',
        '• build, personalize, sell and ship your box, and manage your account and orders;',
        '• suggest items for each child through Ask Rav, our AI shopping assistant;',
        '• process payments and gifts, and send confirmations, shipping updates and support messages;',
        '• send marketing emails about Grapejuice (you can unsubscribe at any time);',
        '• measure and improve our advertising, Services and products;',
        '• prevent fraud, keep the Services secure and enforce our terms; and',
        '• comply with the law and establish, exercise or defend our legal rights.',
        'We may also create aggregated or de-identified information and use it for any purpose.',
      ],
    },
    {
      heading: '4. How we share information',
      body: [
        [{ body: 'Service providers. ', weight: 'semibold' }, 'We share information with companies that run parts of the Services for us, including Google (Firebase hosting, database and sign-in), Stripe (payments), Customer.io (email), our shipping and fulfillment partners, and Anthropic, whose AI powers Ask Rav and our box suggestions. To suggest items, we send Anthropic the family details you enter, which can include children’s first names, ages and interests.'],
        [{ body: 'Advertising and analytics partners. ', weight: 'semibold' }, 'We use Google Analytics and the Meta Pixel, and share event information (such as pages viewed and purchases) and hashed contact details with Google and Meta to measure and improve our ads. We do not share children’s names, ages or interests with advertising partners.'],
        [{ body: 'Gift recipients. ', weight: 'semibold' }, 'If you send a gift, we share your name and note with the recipient.'],
        [{ body: 'Affiliates. ', weight: 'semibold' }, 'We may share information with companies under common ownership or control with Unaffiliated.'],
        [{ body: 'Legal and safety. ', weight: 'semibold' }, 'We may disclose information when we believe it is required by law or appropriate to protect the rights, property or safety of Unaffiliated, our customers or others.'],
        [{ body: 'Corporate transactions. ', weight: 'semibold' }, 'We may disclose information as part of, or in anticipation of, a sale, merger or other transfer of all or part of our business.'],
      ],
    },
    {
      heading: '5. Your rights and choices',
      body: [
        [{ body: 'Emails. ', weight: 'semibold' }, `Every marketing email includes an unsubscribe link. You can also email ${PRIVACY_EMAIL}.`],
        [{ body: 'Saved boxes and email profile. ', weight: 'semibold' }, `Email ${PRIVACY_EMAIL} to have a saved box, the related identifiers, and your Grapejuice email profile deleted. Our team can do this in one step.`],
        [{ body: 'Cookies and ads. ', weight: 'semibold' }, 'Use the cookie settings button on grapejuice.co (“Your Privacy Choices”) to turn off non-essential cookies and opt out of the use of your information for targeted advertising. You can also set your browser to block or delete cookies and local storage. You must make these choices on each browser and device. Even if you opt out of personalized ads, you will still see ads, but they may be less relevant. We do not respond to browser do-not-track signals.'],
        [{ body: 'Access, correction and deletion. ', weight: 'semibold' }, `Depending on where you live, you may have the right to access, correct or delete your personal information, to opt out of its “sale” or “sharing” for targeted advertising, to withdraw consent, and to appeal a decision we make about your request. To make a request, email ${PRIVACY_EMAIL}. We may need to verify your identity first, and we will not discriminate against you for exercising these rights.`],
      ],
    },
    {
      heading: '6. Children',
      body: [
        'Grapejuice is meant for parents, family members and gift-givers, not for children. We do not knowingly collect personal information directly from children under 13. Information about children is provided by the adults shopping for them, is used only to build and deliver their box, and is never used for advertising.',
        `If you think a child under 13 has given us personal information, or you want information about your child deleted, email ${PRIVACY_EMAIL} and we will delete it.`,
      ],
    },
    {
      heading: '7. Data retention',
      body: [
        'Saved boxes for visitors without an account are kept for up to 60 days after they were last opened. Account information is kept while your account is open. Order and payment records are kept as long as needed for tax, accounting and legal purposes. Otherwise, we keep information until we determine it is no longer necessary for the purposes described in this policy.',
      ],
    },
    {
      heading: '8. Security and international transfers',
      body: [
        'We use physical, technical and administrative safeguards to help protect personal information, but no method of storage or transmission is completely secure.',
        'We are headquartered in Canada, and our service providers may process information in the United States and other countries. Where required, we use appropriate safeguards for these transfers.',
      ],
    },
    {
      heading: '9. Changes to this policy',
      body: [
        'We may update this policy from time to time. We will post changes on this page and update the date at the top.',
      ],
    },
    {
      heading: '10. Contact us',
      body: [
        `Questions, requests or complaints about privacy: ${PRIVACY_EMAIL}. Order and shipping questions: hello@grapejuice.co.`,
      ],
    },
  ],
} as const;
