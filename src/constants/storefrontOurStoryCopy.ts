/**
 * Draft Our Story copy — paraphrase of ABOUT_PAGE_VOICE_NOTE_CLEANED.md + Vision deck beliefs.
 * Easy to edit without touching layout.
 */

export const OUR_STORY_COPY = {
  crumb: 'Our Story',
  eyebrow: 'About Grapejuice',
  title: 'Anyone who wants to do Jewish should be able to.',
  lead:
    'We build Grapejuice so anyone interested in Jewish practices can do them however they see fit — holidays, rites of passage, or the occasional Shabbat — so nothing, not cost, proximity, fluency, politics, or religious beliefs get in the way.',
  listening: {
    heading: 'We started by asking people what, if\u00A0anything, they want help with',
    body: [
      'Starting in January 2026, we conducted interviews, organized research panels, and surveyed hundreds of families to better understand where there is friction preventing them from practicing as they wish they could.',
      'For some the barriers were ideological (too religious, too political) and for others they were logistical (too expensive, too time consuming, too hard to remember when it is). Some just didn\'t know where to start.',
      [
        { body: 'We decided to start with Hanukkah.', weight: 'semibold' as const },
        'From our research, we found that more than 80% of people who hold a Jewish identity do it in some form. Of the 20% who don’t, some wish they could.',
      ],
      'Our goal is to make it so noone who wishes they could bring Hanukkah into their home is unable to do so',
    ],
  },
  beliefs: {
    heading: 'What we believe',
    sections: [
      {
        heading: "It's a Practice",
        items: [
          {
            title: "'Jewish' is a verb",
            body:
              'You practice Jewish the way you practice music or medicine — imperfectly, continuously, with accumulating fluency. It\'s not about what you feel or believe, it\'s about what you do. The sense of connection and meaning follows.',
          },
          {
            title: "Anyone can do 'Jewish'",
            body:
              'We don\'t need to see any paperwork. If you want to practice, you can practice. The question of who is Jewish is not our question. Our question is: what is your practice today, what do you wish it were, and how can we help close that gap?',
          },
          {
            title: "'A part' not 'apart'",
            body:
              'We don\'t fear the stranger. We don\'t idealize insularity. Our work is rooted in the traditions of tzedakah (charity), hachnasat orchim (welcoming strangers), and tikkun olam (repairing the world), ones that ask us to open our hearts.',
          },
        ],
      },
      {
        heading: "It's Personal",
        items: [
          {
            title: 'You are enough',
            body:
              "You get to define success on your own terms. We come in with no agenda to change people or engage with them as broken things to be fixed. If you're happy, we're happy. Deficit framing is condescending and it doesn't work.",
          },
          {
            title: 'All is up for interpretation',
            body:
              'The oral torah was given as a living practice — an ongoing invitation for each generation to interpret Judaism on its own terms. The tradition of interpretation is core Jewish technology. It belongs to everyone who practices.',
          },
          {
            title: 'Permission to do it your way',
            body:
              "Many families don't feel empowered to make Jewish practices their own — afraid of doing it wrong, worried about what they don't know. We are in a position to help them realize they are allowed to make it their own – that there's no one right way.",
          },
        ],
      },
      {
        heading: "It's Practical",
        items: [
          {
            title: 'The calendar as technology',
            body:
              "Judaism offers us a unique approach to meaning-making by inviting us to note the passage of time across all time-scales, with rituals for each — lifecycle events, annual holidays, months, weeks, days... You don't need to believe anything to benefit from it.",
          },
          {
            title: 'Practices evolve with you',
            body:
              'We take as a given that people\'s beliefs change, their circumstances change, their kids get older, everything changes. And so it is only natural that one\'s practice should evolve with it. The work of re-imagination is an ongoing process.',
          },
          {
            title: 'Belonging and community',
            body:
              'Jewish culture naturally affords a rich social fabric: shared meals, community aid and accountability, arts patronage, the marking of ordinary time. It should be available to anyone regardless of what they believe.',
          },
        ],
      },
    ],
  },
  give: {
    heading: 'Making it your own doesn’t\u00A0mean doing it alone',
    /** Forced breaks only on compact viewports. */
    headingMobile: "Making it your own\ndoesn’t mean\ndoing it alone",
    body:
      'In addition to the products you see on this site, making it cheap and easy to do Jewish your own way, we also distribute overstocked products to families in need at no cost. This is made possible thanks to donations made by our customers and is further subsidized by our backers. We focus this program on serving families for whom this would be their first Hanukkah, and for people who lack the means to do Hanukkah for themselves.',
    primaryCta: 'Make a donation',
    secondaryCta: 'Gift a Hanukkah box',
  },
  team: {
    heading: 'Who’s behind all this?',
    body:
      'Grapejuice was started in 2026 by Joseph Weissgold, a designer, social entrepreneur, and the son of an (untraditional) rabbi. Grapejuice is a product of Unaffiliated Inc. and is maintained by a small team based out of Toronto and New York. Early funding for the development of Grapejuice was granted by Common Era, a division of the Jim Joseph Foundation.',
  },
  involve: {
    heading: 'Get involved',
    items: [
      { label: 'Buy our products', detail: 'Best way to support the work' },
      { label: 'Give a box', detail: 'Gift Hanukkah or donate a box' },
      { label: 'Tell someone', detail: 'Share on social or with a friend' },
      { label: 'Work with us', detail: 'Interested in joining the team' },
      { label: 'Press', detail: 'Media inquiries' },
      { label: 'Newsletter', detail: 'Hear when new things ship' },
    ],
  },
} as const;
