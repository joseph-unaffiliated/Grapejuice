/**
 * Draft Our Story copy — paraphrase of ABOUT_PAGE_VOICE_NOTE_CLEANED.md + Vision deck beliefs.
 * Easy to edit without touching layout.
 */

export const OUR_STORY_COPY = {
  crumb: 'Our story',
  eyebrow: 'About Grapejuice',
  title: 'Anyone who wants to do Jewish should be able to.',
  lead:
    'We build Grapejuice so people with an interest in doing Jewish can actually do it — holidays, rites of passage, or the occasional Shabbat — so nothing, not cost, proximity, fluency, politics, or religious beliefs get in the way.',
  listening: {
    heading: 'We started by listening',
    body: [
      'We began in 2026 by listening. Even for the most widely practiced parts of Jewish life, some people still feel locked out.',
      { body: 'So we decided to start with Hanukkah.', weight: 'semibold' as const },
      'Hanukkah is by far the most practiced Jewish holiday — more than about 80% of people do it in some form. Roughly one in five don’t. Of those who don’t, some wish they could. Reasons we heard: they don’t know when it’s coming (the lunar calendar shifts each year), it isn’t affordable, they can’t get the materials or don’t know what they need, it feels too politicized right now, or too religious — and they wish there were a way that crossed those barriers.',
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
              'Not a denomination. Not a bloodline certificate. Not a position on Israel. Something you do. You practice Jewish the way you practice music or medicine — imperfectly, continuously, with accumulating depth. "I am Jewish" is identity. "I do Jewish" is practice. Both are true. Only one builds anything.',
          },
          {
            title: "Anyone can do 'Jewish'",
            body:
              'We do not ask for a rabbinical conversion certificate. We do not require Jewish parents or Jewish grandparents. If you want to practice, you can practice. The question of who is Jewish — policed by institutional gatekeepers — is not our question. Our question is: what are you practicing, and toward what end?',
          },
          {
            title: "'A part' not 'apart'",
            body:
              'The community we are building is not inward-facing. The Jewish ethical tradition — tzedakah, tikkun olam, the obligation to repair — produces people who go outward. Until everyone is free, no one is free. This kind of Jewish practice makes people more engaged with the world — not more insular.',
          },
        ],
      },
      {
        heading: "It's Personal",
        items: [
          {
            title: 'You are enough',
            body:
              "We do not start from the premise that disconnected Jewish families are a problem to be solved or a group to be returned to the fold. If they're happy, we're happy. Our work is to build infrastructure to support them on their terms — not to change them. Deficit framing is condescending and it doesn't work.",
          },
          {
            title: 'All is up for interpretation',
            body:
              'The oral torah was given as a living document — an ongoing invitation for each generation to interpret Judaism on its own terms. In a moment of fear, it was declared closed. We are living in the wake of that decision. The tradition of interpretation is core Jewish technology. It belongs to everyone who practices.',
          },
          {
            title: 'Permission to do it your way',
            body:
              "Many secular Jewish families do not feel empowered to make Jewish practices their own — afraid of doing it wrong, uncertain whether it's really for them, worried about what they don't know. Nobody has told them they're allowed to make it their own, no performance required. There's no one right way.",
          },
        ],
      },
      {
        heading: "It's Practical",
        items: [
          {
            title: 'Design for change',
            body:
              'The organizing principle for Jewish family experiences and education is that kids get older every year. Hanukkah for a 4-year-old is different from Hanukkah for an 8-year-old — and both are different from a bar mitzvah at 13. Families are always changing, and so are the conversations.',
          },
          {
            title: 'The calendar is technology',
            body:
              "Judaism's most durable innovation is not theology. It is time-keeping. A structured relationship to the year — Shabbat every week, holidays at their seasons, life cycle moments marked with ritual — is the mechanism by which meaning accretes across a lifetime. You don't need to believe anything to use it.",
          },
          {
            title: 'Culture goes beyond religion',
            body:
              'Without ties to institutional Judaism people lose more than just religion, they lose the social fabric: shared meals, community aid and accountability, arts patronage, the marking of ordinary time. Most of that fabric was not religious in any essential sense — it was cultural. It can be rebuilt without the ideology.',
          },
        ],
      },
    ],
  },
  give: {
    heading: 'Making it your own doesn’t mean doing it alone',
    body:
      'You can donate boxes — we distribute them for free to families. We subsidize programs for people for whom this would be their first Hanukkah, and for people who lack the means to do Hanukkah for themselves. Make a donation if you can; we do not issue tax receipts.',
  },
  team: {
    heading: 'Who’s behind this',
    body:
      'Grapejuice was started in 2026 by Joseph Weissgold, a designer, social entrepreneur, and the son of a (untraditional) rabbi. Grapejuice is a product of Unaffiliated Inc. and is maintained by a small team based out of Toronto and New York. Early funding for the development of Grapejuice was granted by Common Era, a division of the Jim Joseph Foundation.',
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
