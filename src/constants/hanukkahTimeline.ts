export type HanukkahNightPlan = {
  night: number;
  title: string;
  prompt: string;
};

export const HANUKKAH_TIMELINE_2026: HanukkahNightPlan[] = [
  { night: 1, title: 'Start simple', prompt: 'Light one candle and read one short story.' },
  { night: 2, title: 'Keep momentum', prompt: 'Song + candle is enough on busy nights.' },
  { night: 3, title: 'Kid-led night', prompt: 'Let one child pick the story or activity.' },
  { night: 4, title: 'Family meal', prompt: 'Try latkes or sufganiyot and name one win.' },
  { night: 5, title: 'Game night', prompt: 'Dreidel, gelt, and a short blessing.' },
  { night: 6, title: 'Low energy plan', prompt: 'Candles + one question card only.' },
  { night: 7, title: 'Favorite replay', prompt: 'Repeat whatever worked best this week.' },
  { night: 8, title: 'Wrap the holiday', prompt: 'Choose what to keep for next year.' },
];
