/**
 * Grapejuice privacy policy — the full Unaffiliated network policy
 * (unaffiliated.co/privacy/network) plus Grapejuice-specific disclosures in
 * section 12 (saved guest boxes, Retention.com, Ask Rav, children's details).
 * Keep in sync with docs/GUEST_BOX_RECOVERY.md when data flows change.
 */

import {
  legalSectionAnchor,
  type LegalPageCopy,
} from '../components/storefront/StorefrontLegalPage';
import {
  NETWORK_PRIVACY_INTRO,
  NETWORK_PRIVACY_SECTIONS,
  NETWORK_PRIVACY_TOC,
} from './unaffiliatedNetworkLegalCopy';

export const PRIVACY_EMAIL = 'privacy@unaffiliated.co';

const GRAPEJUICE_HEADING = 'Additional Information for Grapejuice';

const toc = [...NETWORK_PRIVACY_TOC, GRAPEJUICE_HEADING];

export const PRIVACY_COPY: LegalPageCopy = {
  eyebrow: 'Legal',
  title: 'Privacy Policy',
  lead: ['Last updated: October 5, 2026'],
  sections: [
    {
      body: [
        ...NETWORK_PRIVACY_INTRO,
        'Grapejuice — grapejuice.co, the Grapejuice app and our Grapejuice emails — is one of our Sites and part of the Services. Grapejuice is made by Untraditional, an Unaffiliated brand. Section 12 describes additional practices that apply to Grapejuice.',
        [{ body: 'TABLE OF CONTENTS', weight: 'semibold' }],
        ...toc.map((item, index) => [
          { body: `${index + 1}. ${item}`, href: `#${legalSectionAnchor(index + 1)}` },
        ]),
      ],
    },
    ...NETWORK_PRIVACY_SECTIONS,
    {
      heading: `12. ${GRAPEJUICE_HEADING}`,
      body: [
        'This section applies when you use Grapejuice. It adds to the rest of this Privacy Policy.',
        [{ body: 'a. Information you give us when you shop', weight: 'semibold' }],
        'When you build a box, create an account, check out, send a gift or contact us, we collect your name, email address, phone number, shipping address and account sign-in details (including through Sign in with Google or Apple); your order history; gift details such as a recipient’s email address and your note to them; your answers to questions about your family’s traditions; and messages you send to Ask Rav, our AI shopping assistant, or to our team.',
        [{ body: 'b. Information about the children you shop for', weight: 'semibold' }],
        'To build a box, a parent or other adult may tell us the first names, ages and interests of the children the box is for, along with the items chosen for them. First names are optional. We use this information only to build and deliver the box, and we never use it for advertising.',
        [{ body: 'c. Payment information', weight: 'semibold' }],
        'Payments are processed by Stripe. We receive limited details such as the card brand and last four digits, but we do not receive or store your full card number.',
        [{ body: 'd. Saved boxes for visitors without an account', weight: 'semibold' }],
        'When you start building a Grapejuice box without signing in, we save your progress — including the first names, ages and interests you enter for the children the box is for, and the items you choose — so you can return to it. This information is stored for up to 60 days (longer if you reopen it) and is deleted when you create an account, which then holds the box, or on request. We store a random visitor identifier in your browser so we can keep your box if you leave and come back.',
        [{ body: 'e. Our identity partner', weight: 'semibold' }],
        'We work with an identity partner, Retention.com, which may recognize visitors to grapejuice.co who have previously agreed to share their email address with its network. If we receive your email address this way, we may send you a small number of emails about the box you started or about Grapejuice. Every such email includes an unsubscribe link; unsubscribing stops them immediately. We never include children’s names in these emails.',
        [{ body: 'f. Service providers we use for Grapejuice', weight: 'semibold' }],
        'Companies that run parts of Grapejuice for us include Google (Firebase hosting, database and sign-in), Stripe (payments), Customer.io (email), our shipping and fulfillment partners, and Anthropic, whose AI powers Ask Rav and our box suggestions. To suggest items, we send Anthropic the family details you enter, which can include children’s first names, ages and interests.',
        [{ body: 'g. Advertising and analytics', weight: 'semibold' }],
        'We use Google Analytics and the Meta Pixel, and share event information (such as pages viewed and purchases) and hashed contact details with Google and Meta to measure and improve our ads. We do not share children’s names, ages or interests with advertising partners. If you send a gift, we share your name and note with the recipient.',
        'We also use Microsoft Clarity to see how visitors use grapejuice.co, through usage measurements, heatmaps and recordings of site sessions (such as clicks, scrolling and page movement), so we can improve the site. Clarity hides what you type into form fields. Microsoft collects this information using cookies and similar technologies; see the Microsoft Privacy Statement (privacy.microsoft.com/privacystatement) for how Microsoft uses it.',
        [{ body: 'h. Your choices on Grapejuice', weight: 'semibold' }],
        'Use the cookie settings button on grapejuice.co (“Your Privacy Choices”) to turn off non-essential cookies and opt out of the use of your information for targeted advertising.',
        `Email ${PRIVACY_EMAIL} to have a saved box, the related identifiers, and your Grapejuice email profile deleted. Our team can do this in one step.`,
        [{ body: 'i. Children', weight: 'semibold' }],
        `Grapejuice is meant for parents, family members and gift-givers, not for children. We do not knowingly collect personal information directly from children under 13. Information about children is provided by the adults shopping for them. If you want information about your child deleted, email ${PRIVACY_EMAIL} and we will delete it.`,
        [{ body: 'j. How long we keep Grapejuice information', weight: 'semibold' }],
        'Saved boxes for visitors without an account are kept for up to 60 days after they were last opened. Account information is kept while your account is open. Order and payment records are kept as long as needed for tax, accounting and legal purposes.',
        [{ body: 'k. Contact', weight: 'semibold' }],
        `Privacy questions, requests or complaints: ${PRIVACY_EMAIL}. Order and shipping questions: hello@grapejuice.co.`,
      ],
    },
  ],
};
